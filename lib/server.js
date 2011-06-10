var SCRIPTS_PATH, Uso, config, createPost, createScript, createTopic, downloadSource, fs, https, loadScripts, m, modifyScript, path, qs, router, saveScripts, scripts, unwatchScript, url_parser, uso;
router = new (require('biggie-router'));
m = require('middleware');
https = require('https');
url_parser = require('url');
Uso = require('./uso');
config = require('../config');
qs = require('querystring');
fs = require('fs');
path = require('path');
uso = new Uso(config.uso.username, config.uso.password);
SCRIPTS_PATH = path.join(__dirname, '..', config.db_path);
scripts = {};
loadScripts = function(json) {
  return fs.readFile(SCRIPTS_PATH, 'utf8', function(error, json) {
    if (error) {
      console.error(error.stack);
      return console.log('[DB] Could not reload scripts');
    }
    try {
      scripts = JSON.parse(json);
      return console.log('[DB] Scripts reloaded');
    } catch (err) {
      console.error(err.stack);
      return console.log('[DB] Error parsing json');
    }
  });
};
try {
  scripts = JSON.parse(fs.readFileSync(SCRIPTS_PATH, 'utf8'));
  fs.watchFile(SCRIPTS_PATH, function(current, previous) {
    if (current.mtime.getTime() === previous.mtime.getTime()) {
      return;
    }
    console.log('[DB] Reloading scripts');
    return loadScripts();
  });
} catch (error) {
  scripts = {};
}
saveScripts = function(done) {
  console.log('[DB] Saving to ' + SCRIPTS_PATH);
  return fs.writeFile(SCRIPTS_PATH, new Buffer(JSON.stringify(scripts, null, '  ')), done);
};
createScript = function(file, commit) {
  return downloadSource(commit.url, file, function(source) {
    return uso.login(function(error) {
      if (error) {
        return console.log("[USO] Could not log in to create script");
      }
      return uso.createScript(source, function(error, script_id) {
        if (error) {
          console.error(error.stack);
          return console.log("[USO] Could not create " + file + ".");
        }
        console.log("[USO] Script " + file + " created.");
        scripts[file] = {
          id: script_id,
          topic: null
        };
        saveScripts();
        return createTopic(file, commit);
      });
    });
  });
};
modifyScript = function(file, commit) {
  var script;
  if (!(script = scripts[file])) {
    return;
  }
  return downloadSource(commit.url, file, function(source) {
    return uso.login(function(error) {
      if (error) {
        return console.log("[USO] Could not log in to modify script");
      }
      return uso.updateScript(script.id, source, function(error, response) {
        if (error) {
          return console.log("[USO] Could not modify " + file + ".");
        }
        console.log("[USO] Script " + file + " modified.");
        if (script.topic) {
          return createPost(file, commit);
        } else {
          return createTopic(file, commit);
        }
      });
    });
  });
};
unwatchScript = function(file) {
  var script;
  if (!(script = scripts[file])) {
    return;
  }
  console.log("[DB] Removing script " + file);
  delete scripts[file];
  return saveScripts();
};
downloadSource = function(url, file, done) {
  return https.get({
    host: 'raw.github.com',
    path: url_parser.parse(url).pathname + ("/" + config.repo.branch + "/" + file)
  }, function(response) {
    var source;
    response.setEncoding('utf8');
    source = '';
    response.on('data', function(chunk) {
      return source += chunk;
    });
    return response.on('end', function() {
      return done(source);
    });
  });
};
createTopic = function(file, commit) {
  var body, script;
  script = scripts[file];
  body = "<p>This change log is auto-generated from the associated\n   <a href=\"" + commit.url + "/commits/" + config.repo.branch + "\">Github commits list</a>.</p>";
  return uso.createTopic('Script', script.id, 'Change Log', body, function(error, topic_id) {
    if (error) {
      return console.log("[USO] Could not create change log topic for " + file + ".");
    }
    console.log("[USO] Created change log topic for " + file + ".");
    script.topic = topic_id;
    saveScripts();
    return createPost(file, commit);
  });
};
createPost = function(file, info) {
  var body, commit, commits, script, _i, _len, _ref;
  script = scripts[file];
  if (!script.topic) {
    return;
  }
  body = '<p>Commits since last version:</p><ul><li>';
  commits = [];
  _ref = info.commits;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    commit = _ref[_i];
    commits.push("<a href='" + info.url + "/commit/" + commit.id + "'>" + commit.message + "</a>");
  }
  body += commits.join('</li><li>');
  body += '</li></ul>';
  return uso.createPost(script.topic, body, function(error) {
    if (error) {
      return console.log("[USO] Could not add change log post for " + file + ".");
    }
    return console.log("[USO] Added change log entry for " + file + ".");
  });
};
router.post('/' + config.hook_path).bind(m.post()).bind(function(request, response, next) {
  var body, changed_files, changes, commit, file, found, hook_owner, owner, task, _i, _j, _k, _l, _len, _len2, _len3, _len4, _len5, _m, _ref, _ref2, _ref3, _ref4, _results;
  console.log('[GITHUB] Received hook');
  next();
  try {
    body = qs.parse(response.body);
    body = JSON.parse(body.payload);
  } catch (error) {
    return;
  }
  hook_owner = body.repository.owner.name.toLowerCase();
  found = false;
  _ref = config.repo.owners;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    owner = _ref[_i];
    if (hook_owner === owner.toLowerCase()) {
      found = true;
    }
  }
  if (!found) {
    return console.log("[GITHUB] User '" + body.repository.owner.name + "' not authorised. Ignoring");
  }
  if (("refs/heads/" + config.repo.branch) !== body.ref) {
    return console.log("[GITHUB] Branch didn't match '" + config.repo.branch + "'. Ignoring");
  }
  changes = {};
  _ref2 = body.commits;
  for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
    commit = _ref2[_j];
    changed_files = [];
    changed_files.push.apply(changed_files, commit.added);
    changed_files.push.apply(changed_files, commit.modified);
    for (_k = 0, _len3 = changed_files.length; _k < _len3; _k++) {
      file = changed_files[_k];
      if (file.match(/\.user\.js$/)) {
        changes[file] || (changes[file] = {
          url: body.repository.url,
          commits: []
        });
        changes[file].state = 'changed';
        changes[file].commits.push(commit);
      }
    }
    _ref3 = commit.removed;
    for (_l = 0, _len4 = _ref3.length; _l < _len4; _l++) {
      file = _ref3[_l];
      if (file.match(/\.user\.js$/)) {
        changes[file] || (changes[file] = {
          url: body.repository.url,
          commits: []
        });
        changes[file].state = 'removed';
        changes[file].commits.push(commit);
      }
    }
  }
  if (0 === Object.keys(changes).length) {
    _ref4 = Object.keys(scripts);
    for (_m = 0, _len5 = _ref4.length; _m < _len5; _m++) {
      file = _ref4[_m];
      changes[file] = {
        state: 'changed',
        url: body.repository.url,
        commits: [
          {
            id: body.after,
            message: 'Re-deploy'
          }
        ]
      };
    }
  }
  _results = [];
  for (file in changes) {
    task = changes[file];
    _results.push((function() {
      switch (task.state) {
        case 'changed':
          if (scripts[file]) {
            return modifyScript(file, task);
          } else {
            return createScript(file, task);
          }
          break;
        case 'removed':
          return unwatchScript(file, task);
      }
    })());
  }
  return _results;
});
router.bind(function(request, response, next) {
  return next.send(200, "Dead end.");
});
router.listen(config.port);