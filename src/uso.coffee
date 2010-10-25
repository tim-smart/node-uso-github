qs   = require 'querystring'
http = require 'http'
noop = ->

usoRequest = (uso, options) ->
  options.method   or= 'GET'
  options.callback or= noop

  options.headers           or= {}
  options.headers['Host']     = Uso.HOST
  options.headers['Cookie'] or= ''
  cookie_array                = []

  for key, value of uso.last.cookies
    cookie_array.push "#{key}=#{value}"
  options.headers['Cookie'] += cookie_array.join '; '

  if options.body
    options.headers['Content-Length'] = Buffer.byteLength options.body

  request = uso.client.request options.method, options.uri, options.headers
  request.on 'response', (response) ->
    response.setEncoding 'utf8'
    body = ''
    response.on 'data', (chunk) -> body += chunk
    response.on 'end', -> handleResponse uso, options, response, body
  request.end options.body || undefined

handleResponse = (uso, options, response, body) ->
  if 'POST' is options.method and -1 is body.indexOf 'redirected</a>.</body>'
    return options.callback new Error 'Operation was not a sucess'

  # Handle cookies etc.
  if response.headers['set-cookie']
    for cookie in response.headers['set-cookie']
      cookie = cookie.split ';'
      cookie = cookie[0].split '='
      uso.last.cookies[cookie[0].trim()] = cookie[1].trim()

  response.body = body

  # Done.
  options.callback null, response

multipartEncode = (boundary, params) ->
  ret = ''
  for key, value of params
    ret += "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{key}\"\r\n\r\n#{value}\r\n"
  ret += "--#{boundary}--\r\n"
  ret

class Uso
  constructor: (username, password) ->
    @client = http.createClient 80, Uso.HOST
    @user   = username
    @pass   = password

    @last =
      auth_token: null
      cookies:    {}

  @HOST:        'userscripts.org'
  @AUTH_RE:     /name="authenticity_token" type="hidden" value=(".+?")/
  @JSAUTH_RE:   /auth_token = (".+?");/
  @SCRIPTID_RE: /scripts\/edit\/(\d+)/
  @TOPICID_RE:  /topics\/(\d+)/
  @POSTID_RE:   /posts-(\d+)/

  get: (path, done) ->
    usoRequest this,
      method: 'GET'
      uri: path
      callback: done

  post: (options) ->
    body = multipartEncode '----NodeJSBoundary', options.body
    usoRequest this,
      method:   'POST'
      uri:      options.uri
      headers:
        'Content-Type': 'multipart/form-data; boundary=----NodeJSBoundary'
      body:     body
      callback: options.callback

  getAuthToken: (body, no_form) ->
    # Authenticity token.
    Uso.AUTH_RE.lastIndex   = 0
    Uso.JSAUTH_RE.lastIndex = 0
    auth_token              = null

    regex = if no_form then Uso.JSAUTH_RE else Uso.AUTH_RE

    if match = body.match regex
      @last.auth_token = auth_token = JSON.parse match[1]

    auth_token

  login: (done) ->
    self = this
    @get '/login', (error, response) =>
      return done error if error
      body = qs.stringify
        login:              @user
        password:           @pass
        remember_me:        '0'
        authenticity_token: @getAuthToken response.body
      usoRequest this,
        method:   'POST'
        uri:      '/sessions'
        body:     body
        headers:
          'Content-Type': 'application/x-www-form-urlencoded'
        callback: done

  # Multipart
  createScript: (source, done) ->
    @get '/scripts/new?form=true', (error, response) =>
      return done error if error
      @post
        uri: '/scripts/create'
        body:
          authenticity_token: @getAuthToken response.body
          form:               'true'
          'script[src]':      source
        callback: (error, response) ->
          return done error if error
          Uso.SCRIPTID_RE.lastIndex = 0
          if match = response.body.match Uso.SCRIPTID_RE
            done null, +match[1], response
          else done new Error 'Failed to create script'

  updateScript: (id, source, done) ->
    @get "/scripts/edit_src/#{id}", (error, response) =>
      return done error if error
      @post
        body:
          authenticity_token: @getAuthToken response.body
          src:                source
        uri:      "/scripts/edit_src/#{id}"
        callback: done

  deleteScript: (id, done) ->
    @get "/scripts/show/#{id}", (error, response) =>
      return done error if error
      @post
        body:
          authenticity_token: @getAuthToken(response.body, true)
        uri:      "/scripts/delete/#{id}"
        callback: done

  createTopic: (type, id, title, body, done) ->
    @get "/topics/new?#{type.toLowerCase()}_id=#{id}", (error, response) =>
      return done error if error
      @post
        body:
          authenticity_token:      @getAuthToken response.body
          'topic[title]':          title
          'topic[body]':           body
          'topic[forumable_id]':   id
          'topic[forumable_type]': type
        uri:      "/topics"
        callback: (error, response) ->
          return done error if error
          Uso.TOPICID_RE.lastIndex = 0
          if match = response.body.match Uso.TOPICID_RE
            done null, +match[1], response
          else done new Error 'Failed to create topic'

  createPost: (topic_id, body, done) ->
    @get "/topics/#{topic_id}", (error, response) =>
      return done error if error
      @post
        body:
          authenticity_token: @getAuthToken response.body
          'post[body]':       body
        uri:      "/topics/#{topic_id}/posts"
        callback: (error, response) ->
          return done error if error
          Uso.POSTID_RE.lastIndex = 0
          if match = response.body.match Uso.POSTID_RE
            done null, +match[1], response
          else done new Error 'Failed to create post'

module.exports = Uso
