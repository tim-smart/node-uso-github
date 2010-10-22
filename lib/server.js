var Uso, config, createPost, createTopic, downloadSource, fs, github, http, modifyScript, newScript, path, qs, router, saveScripts, scripts, scripts_path, unwatchScript, url_parser, uso;
var __hasProp = Object.prototype.hasOwnProperty;
router = new (require('biggie-router'));
http = require('http');
url_parser = require('url');
Uso = require('./uso');
config = require('../config');
qs = require('querystring');
fs = require('fs');
path = require('path');
uso = new Uso(config.uso.username, config.uso.password);
github = http.createClient(80, 'github.com');
scripts_path = path.join(__dirname, '..', config.db_path);
try {
  scripts = JSON.parse(fs.readFileSync(scripts_path, 'utf8'));
} catch (error) {
  scripts = {};
}
saveScripts = function(done) {
  console.log('[DB] Saving to ' + scripts_path);
  return fs.writeFile(scripts_path, new Buffer(JSON.stringify(scripts, null, '  ')), done);
};
newScript = function(file, commit) {
  return downloadSource(commit.url, file, function(source) {
    return uso.login(function(error) {
      if (error) {
        return console.log("[USO] Could not log in to create script");
      }
      return uso.newScript(source, function(error, script_id) {
        if (error) {
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
        return createPost(file, commit);
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
  var request;
  request = github.request('GET', url_parser.parse(url).pathname + ("/raw/" + (config.repo.branch) + "/" + file), {
    Host: 'github.com'
  });
  request.on('response', function(response) {
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
  return request.end();
};
createTopic = function(file, commit) {
  var body, script;
  script = scripts[file];
  body = ("<p>This change log is auto-generated from the associated\n   <a href=\"" + (commit.url) + "/commits/" + (config.repo.branch) + "\">Github commits list</a>.</p>");
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
  var _i, _len, _ref, body, commit, commits, script;
  script = scripts[file];
  if (!script.topic) {
    return;
  }
  body = '<p>Commits since last version:</p><ul><li>';
  commits = [];
  for (_i = 0, _len = (_ref = info.commits).length; _i < _len; _i++) {
    commit = _ref[_i];
    commits.push("<a href='" + (info.url) + "/commit/" + (commit.id) + "'>" + (commit.message) + "</a>");
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
router.post('/hook').module('post').bind(function(request, response, next) {
  var _i, _j, _k, _l, _len, _len2, _len3, _len4, _ref, _ref2, _ref3, _result, body, changed_files, changes, commit, file, task;
  console.log('[GITHUB] Received hook');
  next();
  try {
    body = qs.parse(response.body);
    body = JSON.parse(body.payload);
  } catch (error) {
    return;
  }
  if (("refs/heads/" + (config.repo.branch)) !== body.ref) {
    return console.log("[GITHUB] Branch didn't match '" + (config.repo.branch) + "'. Ignoring");
  }
  changes = {};
  for (_i = 0, _len = (_ref = body.commits).length; _i < _len; _i++) {
    commit = _ref[_i];
    changed_files = [];
    changed_files.push.apply(changed_files, commit.added);
    changed_files.push.apply(changed_files, commit.modified);
    for (_j = 0, _len2 = changed_files.length; _j < _len2; _j++) {
      file = changed_files[_j];
      if (file.match(/\.user\.js$/)) {
        changes[file] || (changes[file] = {
          state: 'changed',
          url: body.repository.url,
          commits: []
        });
        changes[file].commits.push(commit);
      }
    }
    for (_k = 0, _len3 = (_ref2 = commit.removed).length; _k < _len3; _k++) {
      file = _ref2[_k];
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
    for (_l = 0, _len4 = (_ref3 = Object.keys(scripts)).length; _l < _len4; _l++) {
      file = _ref3[_l];
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
  _result = [];
  for (file in changes) {
    if (!__hasProp.call(changes, file)) continue;
    task = changes[file];
    _result.push((function() {
      switch (task.state) {
        case 'changed':
          return scripts[file] ? modifyScript(file, task) : newScript(file, task);
        case 'removed':
          return unwatchScript(file, task);
      }
    })());
  }
  return _result;
});
router.bind(function(request, response) {
  return response.send(200, "Dead end.");
});
router.listen(8080);