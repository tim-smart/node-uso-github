var Uso, handleResponse, http, multipartEncode, qs, request, usoRequest;
var __hasProp = Object.prototype.hasOwnProperty, __bind = function(func, context) {
  return function() { return func.apply(context, arguments); };
};
request = require('request');
qs = require('querystring');
http = require('http');
usoRequest = function(uso, options, done) {
  var _base, _ref, cookie_array, key, value;
  options.method || (options.method = 'GET');
  options.headers || (options.headers = {});
  options.headers['Host'] = Uso.HOST;
  (_base = options.headers)['Cookie'] || (_base['Cookie'] = '');
  cookie_array = [];
  for (key in _ref = uso.last.cookies) {
    if (!__hasProp.call(_ref, key)) continue;
    value = _ref[key];
    cookie_array.push("" + key + "=" + value);
  }
  options.headers['Cookie'] += cookie_array.join('; ');
  if (options.body) {
    options.headers['Content-Length'] = Buffer.byteLength(options.body);
  }
  request = uso.client.request(options.method, options.uri, options.headers);
  request.on('response', function(response) {
    var body;
    response.setEncoding('utf8');
    body = '';
    response.on('data', function(chunk) {
      return body += chunk;
    });
    return response.on('end', function() {
      return handleResponse(uso, options, response, body, done);
    });
  });
  return request.end(options.body || undefined);
};
handleResponse = function(uso, options, response, body, done) {
  var _i, _len, _ref, cookie;
  if ('POST' === options.method && -1 === body.indexOf('redirected</a>.</body>')) {
    return done(new Error('Operation was not a sucess'));
  }
  if (response.headers['set-cookie']) {
    for (_i = 0, _len = (_ref = response.headers['set-cookie']).length; _i < _len; _i++) {
      cookie = _ref[_i];
      cookie = cookie.split(';');
      cookie = cookie[0].split('=');
      uso.last.cookies[cookie[0].trim()] = cookie[1].trim();
    }
  }
  response.body = body;
  return done(null, response);
};
multipartEncode = function(boundary, params) {
  var key, ret, value;
  ret = '';
  for (key in params) {
    if (!__hasProp.call(params, key)) continue;
    value = params[key];
    ret += ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + value + "\r\n");
  }
  ret += ("--" + boundary + "--\r\n");
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
    return this;
  };
  return Uso;
})();
Uso.HOST = 'userscripts.org';
Uso.AUTH_RE = /auth_token = (".+?");/;
Uso.SCRIPTID_RE = /scripts\/edit\/(\d+)/;
Uso.TOPICID_RE = /topics\/(\d+)/;
Uso.POSTID_RE = /posts-(\d+)/;
Uso.prototype.get = function(path, done) {
  return usoRequest(this, {
    method: 'GET',
    uri: path
  }, done);
};
Uso.prototype.post = function(path, params, done) {
  return usoRequest(this, {
    method: 'POST',
    uri: path,
    body: qs.stringify(params)
  }, done);
};
Uso.prototype.getAuthToken = function(body) {
  var auth_token, match;
  Uso.AUTH_RE.lastIndex = 0;
  auth_token = null;
  if (match = body.match(Uso.AUTH_RE)) {
    this.last.auth_token = (auth_token = JSON.parse(match[1]));
  }
  return auth_token;
};
Uso.prototype.login = function(done) {
  var self;
  self = this;
  return this.get('/login', __bind(function(error, response) {
    if (error) {
      return done(error);
    }
    return this.post('/sessions', {
      login: this.user,
      password: this.pass,
      remember_me: '0',
      authenticity_token: this.getAuthToken(response.body)
    }, done);
  }, this));
};
Uso.prototype.newScript = function(source, done) {
  return this.get('/scripts/new?form=true', __bind(function(error, response) {
    var body;
    if (error) {
      return done(error);
    }
    body = multipartEncode('----NodeJSBoundary', {
      authenticity_token: this.getAuthToken(response.body),
      form: 'true',
      'script[src]': source
    });
    return usoRequest(this, {
      method: 'POST',
      uri: '/scripts/create',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      },
      body: body
    }, function(error, response) {
      var match;
      if (error) {
        return done(error);
      }
      Uso.SCRIPTID_RE.lastIndex = 0;
      return (match = response.body.match(Uso.SCRIPTID_RE)) ? done(null, +match[1], response) : done(new Error('Failed to create script'));
    });
  }, this));
};
Uso.prototype.updateScript = function(id, source, done) {
  return this.get("/scripts/edit_src/" + id, __bind(function(error, response) {
    var body;
    if (error) {
      return done(error);
    }
    body = multipartEncode('----NodeJSBoundary', {
      authenticity_token: this.getAuthToken(response.body),
      src: source
    });
    return usoRequest(this, {
      method: 'POST',
      uri: ("/scripts/edit_src/" + id),
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      },
      body: body
    }, done);
  }, this));
};
Uso.prototype.deleteScript = function(id, done) {
  return this.get("/scripts/show/" + id, __bind(function(error, response) {
    var body;
    if (error) {
      return done(error);
    }
    body = multipartEncode('----NodeJSBoundary', {
      authenticity_token: this.getAuthToken(response.body)
    });
    return usoRequest(this, {
      method: 'POST',
      uri: ("/scripts/delete/" + id),
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      },
      body: body
    }, done);
  }, this));
};
Uso.prototype.createTopic = function(type, id, title, body, done) {
  return this.get("/topics/new?" + (type.toLowerCase()) + "_id=" + id, __bind(function(error, response) {
    if (error) {
      return done(error);
    }
    body = multipartEncode('----NodeJSBoundary', {
      authenticity_token: this.getAuthToken(response.body),
      'topic[title]': title,
      'topic[body]': body,
      'topic[forumable_id]': id,
      'topic[forumable_type]': type
    });
    return usoRequest(this, {
      method: 'POST',
      uri: "/topics",
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      },
      body: body
    }, function(error, response) {
      var match;
      if (error) {
        return done(error);
      }
      Uso.TOPICID_RE.lastIndex = 0;
      return (match = response.body.match(Uso.TOPICID_RE)) ? done(null, +match[1], response) : done(new Error('Failed to create topic'));
    });
  }, this));
};
Uso.prototype.createPost = function(topic_id, body, done) {
  return this.get("/topics/" + topic_id, __bind(function(error, response) {
    if (error) {
      return done(error);
    }
    body = multipartEncode('----NodeJSBoundary', {
      authenticity_token: this.getAuthToken(response.body),
      'post[body]': body
    });
    return usoRequest(this, {
      method: 'POST',
      uri: ("/topics/" + topic_id + "/posts"),
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      },
      body: body
    }, function(error, response) {
      var match;
      if (error) {
        return done(error);
      }
      Uso.POSTID_RE.lastIndex = 0;
      return (match = response.body.match(Uso.POSTID_RE)) ? done(null, +match[1], response) : done(new Error('Failed to create post'));
    });
  }, this));
};
module.exports = Uso;