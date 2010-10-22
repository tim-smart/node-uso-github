spawn = require('child_process').spawn

task 'build', 'Build coffee files into lib', ->
  #exec 'coffee -bco lib src/*.coffee'
  build = spawn 'coffee', ['-bco', 'lib'
                'src/server.coffee'
                'src/uso.coffee']
  build.stdout.pipe process.stdout
