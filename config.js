module.exports = {
  uso:       {
    // Userscript.org e-mail address
    username: '',
    // Password
    password: ''
  },
  repo:      {
    // Allowed github repository owners.
    owners: ['Tim-Smart'],
    // Branch to watch
    branch: 'uso'
  },
  // Relative / absolute path to save / load scripts from.
  db_path:   'scripts.json',
  // HTTP /path to listen for Github hooks.
  hook_path: 'hook',
  // Port the HTTP server should listen on.
  port:      8080
};
