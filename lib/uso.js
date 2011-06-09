var Uso, handleResponse, http, multipartEncode, noop, qs, usoRequest;
var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
qs = require('querystring');
http = require('http');
noop = function() {};
usoRequest = function(uso, options) {
  var cookie_array, key, request, value, _base, _ref;
  options.method || (options.method = 'GET');
  options.callback || (options.callback = noop);
  options.headers || (options.headers = {});
  options.headers['Host'] = Uso.HOST;
  (_base = options.headers)['Cookie'] || (_base['Cookie'] = '');
  cookie_array = [];
  _ref = uso.last.cookies;
  for (key in _ref) {
    value = _ref[key];
    cookie_array.push("" + key + "=" + value);
  }
  options.headers['Cookie'] += cookie_array.join('; ');
  if (options.body) {
    options.headers['Content-Length'] = Buffer.byteLength(options.body);
  }
  request = http.request(options.method, options.uri, options.headers);
  request.on('response', function(response) {
    var body;
    response.setEncoding('utf8');
    body = '';
    response.on('data', function(chunk) {
      return body += chunk;
    });
    return response.on('end', function() {
      return handleResponse(uso, options, response, body);
    });
  });
  return request.end(options.body || void 0);
};
handleResponse = function(uso, options, response, body) {
  var cookie, _i, _len, _ref;
  if ('POST' === options.method && -1 === body.indexOf('redirected</a>.</body>')) {
    return options.callback(new Error('Operation was not a sucess'));
  }
  if (response.headers['set-cookie']) {
    _ref = response.headers['set-cookie'];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      cookie = _ref[_i];
      cookie = cookie.split(';');
      cookie = cookie[0].split('=');
      uso.last.cookies[cookie[0].trim()] = cookie[1].trim();
    }
  }
  response.body = body;
  return options.callback(null, response);
};
multipartEncode = function(boundary, params) {
  var key, ret, value;
  ret = '';
  for (key in params) {
    value = params[key];
    ret += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + value + "\r\n";
  }
  ret += "--" + boundary + "--\r\n";
  return ret;
};
Uso = (function() {
  function Uso(username, password) {
    this.client = http.createClient(80, Uso.HOST);
    this.user = username;
    this.pass = password;
    this.last = {
      auth_token: null,
      cookies: {}
    };
  }
  Uso.HOST = 'userscripts.org';
  Uso.AUTH_RE = /name="authenticity_token" type="hidden" value=(".+?")/;
  Uso.JSAUTH_RE = /auth_token = (".+?");/;
  Uso.SCRIPTID_RE = /scripts\/edit\/(\d+)/;
  Uso.TOPICID_RE = /topics\/(\d+)/;
  Uso.POSTID_RE = /posts-(\d+)/;
  Uso.prototype.get = function(path, done) {
    return usoRequest(this, {
      method: 'GET',
      uri: path,
      callback: done
    });
  };
  Uso.prototype.post = function(options) {
    var body;
    body = multipartEncode('----NodeJSBoundary', options.body);
    return usoRequest(this, {
      method: 'POST',
      uri: options.uri,
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      },
      body: body,
      callback: options.callback
    });
  };
  Uso.prototype.getAuthToken = function(body, no_form) {
    var auth_token, match, regex;
    Uso.AUTH_RE.lastIndex = 0;
    Uso.JSAUTH_RE.lastIndex = 0;
    auth_token = null;
    regex = no_form ? Uso.JSAUTH_RE : Uso.AUTH_RE;
    if (match = body.match(regex)) {
      this.last.auth_token = auth_token = JSON.parse(match[1]);
    }
    return auth_token;
  };
  Uso.prototype.login = function(done) {
    var self;
    self = this;
    return this.get('/login', __bind(function(error, response) {
      var body;
      if (error) {
        return done(error);
      }
      body = qs.stringify({
        login: this.user,
        password: this.pass,
        remember_me: '0',
        authenticity_token: this.getAuthToken(response.body)
      });
      return usoRequest(this, {
        method: 'POST',
        uri: '/sessions',
        body: body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        callback: done
      });
    }, this));
  };
  Uso.prototype.createScript = function(source, done) {
    return this.get('/scripts/new?form=true', __bind(function(error, response) {
      if (error) {
        return done(error);
      }
      return this.post({
        uri: '/scripts/create',
        body: {
          authenticity_token: this.getAuthToken(response.body),
          form: 'true',
          'script[src]': source
        },
        callback: function(error, response) {
          var match;
          if (error) {
            return done(error);
          }
          Uso.SCRIPTID_RE.lastIndex = 0;
          if (match = response.body.match(Uso.SCRIPTID_RE)) {
            return done(null, +match[1], response);
          } else {
            return done(new Error('Failed to create script'));
          }
        }
      });
    }, this));
  };
  Uso.prototype.updateScript = function(id, source, done) {
    return this.get("/scripts/edit_src/" + id, __bind(function(error, response) {
      if (error) {
        return done(error);
      }
      return this.post({
        body: {
          authenticity_token: this.getAuthToken(response.body),
          src: source
        },
        uri: "/scripts/edit_src/" + id,
        callback: done
      });
    }, this));
  };
  Uso.prototype.deleteScript = function(id, done) {
    return this.get("/scripts/show/" + id, __bind(function(error, response) {
      if (error) {
        return done(error);
      }
      return this.post({
        body: {
          authenticity_token: this.getAuthToken(response.body, true)
        },
        uri: "/scripts/delete/" + id,
        callback: done
      });
    }, this));
  };
  Uso.prototype.createTopic = function(type, id, title, body, done) {
    return this.get("/topics/new?" + (type.toLowerCase()) + "_id=" + id, __bind(function(error, response) {
      if (error) {
        return done(error);
      }
      return this.post({
        body: {
          authenticity_token: this.getAuthToken(response.body),
          'topic[title]': title,
          'topic[body]': body,
          'topic[forumable_id]': id,
          'topic[forumable_type]': type
        },
        uri: "/topics",
        callback: function(error, response) {
          var match;
          if (error) {
            return done(error);
          }
          Uso.TOPICID_RE.lastIndex = 0;
          if (match = response.body.match(Uso.TOPICID_RE)) {
            return done(null, +match[1], response);
          } else {
            return done(new Error('Failed to create topic'));
          }
        }
      });
    }, this));
  };
  Uso.prototype.createPost = function(topic_id, body, done) {
    return this.get("/topics/" + topic_id, __bind(function(error, response) {
      if (error) {
        return done(error);
      }
      return this.post({
        body: {
          authenticity_token: this.getAuthToken(response.body),
          'post[body]': body
        },
        uri: "/topics/" + topic_id + "/posts",
        callback: function(error, response) {
          var match;
          if (error) {
            return done(error);
          }
          Uso.POSTID_RE.lastIndex = 0;
          if (match = response.body.match(Uso.POSTID_RE)) {
            return done(null, +match[1], response);
          } else {
            return done(new Error('Failed to create post'));
          }
        }
      });
    }, this));
  };
  return Uso;
})();
module.exports = Uso;