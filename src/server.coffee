router     = new (require 'biggie-router')
m          = require 'middleware'
https      = require 'https'
url_parser = require 'url'
Uso        = require './uso'
config     = require '../config'
qs         = require 'querystring'
fs         = require 'fs'
path       = require 'path'

uso = new Uso config.uso.username, config.uso.password

SCRIPTS_PATH = path.join __dirname, '..', config.db_path

loadScripts = (json) ->
  fs.readFile SCRIPTS_PATH, 'utf', (error, json) ->
    if error
      console.error error.stack
      return console.log '[DB] Could not reload scripts'

    try
      scripts = JSON.parse json
    catch err
      console.error err.stack
      console.log '[DB] Error parsing json'

try
  scripts = JSON.parse fs.readFileSync SCRIPTS_PATH, 'utf8'

  fs.watchFile SCRIPTS_PATH, (current, previous) ->
    if current.mtime.getTime() is previous.mtime.getTime()
      return
    console.log '[DB] Reloading scripts'
    loadScripts()
catch error
  scripts = {}


saveScripts = (done) ->
  console.log '[DB] Saving to ' + SCRIPTS_PATH
  fs.writeFile SCRIPTS_PATH, new Buffer(JSON.stringify scripts, null, '  '), done

createScript = (file, commit) ->
  downloadSource commit.url, file, (source) ->
    uso.login (error) ->
      if error
        return console.log "[USO] Could not log in to create script"
      uso.createScript source, (error, script_id) ->
        if error
          console.error error.stack
          return console.log "[USO] Could not create #{file}."
        console.log "[USO] Script #{file} created."
        scripts[file] =
          id:    script_id
          topic: null
        saveScripts()
        createTopic file, commit

modifyScript = (file, commit) ->
  return unless script = scripts[file]

  downloadSource commit.url, file, (source) ->
    uso.login (error) ->
      if error
        return console.log "[USO] Could not log in to modify script"
      uso.updateScript script.id, source, (error, response) ->
        return console.log "[USO] Could not modify #{file}." if error
        console.log "[USO] Script #{file} modified."
        if script.topic
          createPost file, commit
        else
          createTopic file, commit

unwatchScript = (file) ->
  return unless script = scripts[file]

  console.log "[DB] Removing script #{file}"
  delete scripts[file]
  saveScripts()

downloadSource = (url, file, done) ->
  https.get
    host : 'raw.github.com'
    path : url_parser.parse(url).pathname + "/#{config.repo.branch}/#{file}",
  , (response) ->
    response.setEncoding 'utf8'
    source = ''
    response.on 'data', (chunk) ->
      source += chunk
    response.on 'end', -> done source

createTopic = (file, commit) ->
  script = scripts[file]
  body   = """
           <p>This change log is auto-generated from the associated
              <a href="#{commit.url}/commits/#{config.repo.branch}">Github commits list</a>.</p>
           """
  uso.createTopic 'Script', script.id, 'Change Log', body, (error, topic_id) ->
    return console.log "[USO] Could not create change log topic for #{file}." if error
    console.log "[USO] Created change log topic for #{file}."
    script.topic = topic_id
    saveScripts()
    createPost file, commit

createPost = (file, info) ->
  script = scripts[file]
  return unless script.topic

  body    = '<p>Commits since last version:</p><ul><li>'
  commits = []

  for commit in info.commits
    # TODO: Escape HTML entities in message.
    commits.push "<a href='#{info.url}/commit/#{commit.id}'>#{commit.message}</a>"

  body += commits.join '</li><li>'
  body += '</li></ul>'

  uso.createPost script.topic, body, (error) ->
    return console.log "[USO] Could not add change log post for #{file}." if error
    console.log "[USO] Added change log entry for #{file}."

router.post('/' + config.hook_path).bind(m.post()).bind (request, response, next) ->
  console.log '[GITHUB] Received hook'

  # We aren't responding
  next()

  # We have recieved a github post commit hook
  # If it has a payload, then we are in business.
  try
    body = qs.parse response.body
    body = JSON.parse body.payload
  catch error
    return

  # Authorised owner?
  hook_owner = body.repository.owner.name.toLowerCase()
  found      = no
  for owner in config.repo.owners when hook_owner is owner.toLowerCase()
    found = yes
  if not found
    return console.log "[GITHUB] User '#{body.repository.owner.name}' not authorised. Ignoring"

  # We have the commits, now parse the suckers.
  if "refs/heads/#{config.repo.branch}" isnt body.ref
    return console.log "[GITHUB] Branch didn't match '#{config.repo.branch}'. Ignoring"

  changes = {}
  for commit in body.commits
    changed_files = []
    changed_files.push.apply changed_files, commit.added
    changed_files.push.apply changed_files, commit.modified

    for file in changed_files when file.match /\.user\.js$/
      changes[file] or=
        url:     body.repository.url
        commits: []
      changes[file].state = 'changed'
      changes[file].commits.push commit
    for file in commit.removed when file.match /\.user\.js$/
      changes[file] or=
        url:      body.repository.url
        commits: []
      changes[file].state = 'removed'
      changes[file].commits.push commit

  # Branch create? Re-deploy all scripts
  if 0 is Object.keys(changes).length
    for file in Object.keys scripts
      changes[file] =
        state:   'changed'
        url:     body.repository.url
        commits: [id: body.after, message: 'Re-deploy']

  for file, task of changes
    switch task.state
      when 'changed'
        if scripts[file] then modifyScript file, task
        else                  createScript file, task
      when 'removed'     then unwatchScript file, task

router.bind (request, response, next) ->
  next.send 200, "Dead end."

router.listen config.port
