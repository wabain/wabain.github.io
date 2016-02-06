module.exports = function (grunt) {
  'use strict';
  // Project configuration
  grunt.initConfig({
    // Metadata
    pkg: grunt.file.readJSON('package.json'),
    banner: '<%= pkg.name %> v<%= pkg.version %>'+
      '<%= grunt.option("release-build") ? "" : " [dev build]" %>, ' +
      '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
      '   Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>',

    clean: {
      dist: ['home-assets/**', 'section-partial/**']
    },

    concat: {
      options: {
        banner: '/* <%= banner %> */\n',
        stripBanners: true
      },
      js: {
        src: ['src/js/**/*.js'],
        dest: 'home-assets/cs-homepage.js'
      }
    },

    uglify: {
      options: {
        banner: '/* <%= banner %> */',
        sourceMap: true,
        // Default is to remove the .js
        sourceMapName: function (name) {return name+'.map';}
      },
      default: {
        src: 'home-assets/cs-homepage.js',
        dest: 'home-assets/cs-homepage.min.js'
      }
    },

    copy: {
      sass: {
        options: {
          // Prepend the banner
          process: function (content) {
            return '/* '+grunt.config('banner')+' */\n\n'+content;
          }
        },
        files: [
          {
            expand: true,
            cwd: 'src/scss/',
            src: ['**/*.scss'],
            dest: 'home-assets/scss/'
          }
        ]
      },
      section_partials: {
        expand: true,
        src: ['*.html'],
        dest: 'section-partial/'
      },
      other_assets: {
        files: [
          {
            expand: true,
            cwd: 'src/assets',
            src: ['img/**/*'],
            dest: 'home-assets/'
          },
          {
            expand: true,
            dot: true,
            cwd: 'src/assets/root',
            src: '**/*',
            dest: 'dist/'
          }
        ]
      },
      bower_assets: {
        files: [
          {
            expand: true,
            cwd: 'bower_components/html5shiv/dist/',
            src: 'html5shiv.min.js',
            dest: 'home-assets/vendor/'
          },
          {
            expand: true,
            cwd: 'bower_components/fancybox/source/',
            src: '**/*',
            dest: 'home-assets/vendor/fancybox/'
          }
        ]
      }
    },

    sass: {
      release: {
        options: {
          style: 'compressed'
        },
        src: 'home-assets/scss/cs-homepage.scss',
        dest: 'home-assets/cs-homepage.min.css'
      },
      dev: {
        options: {
          style: 'expanded'
        },
        src: 'home-assets/scss/cs-homepage.scss',
        dest: 'home-assets/cs-homepage.css'
      }
    },

    scsslint: {
      files: ['src/scss/**/*.scss']
    },

    watch: {
      options: {
        livereload: true
      },
      sass: {
        files: ['src/scss/**/*.scss'],
        tasks: ['scsslint', 'copy:sass', 'sass:dev']
      },
      html: {
        files: ['src/scaffolding/**/*', 'src/content/**/*'],
        tasks: ['copy:section_partials']
      },
      js: {
        files: ['src/js/**/*.js'],
        tasks: ['jshint:src', 'concat']
      },
      gruntfile: {
        files: ['Gruntfile.js'],
        tasks: ['jshint:gruntfile', 'build']
      }
    },

    jshint: {
      options: {
        node: true,
        // curly: true,
        eqeqeq: true,
        forin: true,
        immed: true,
        latedef: 'nofunc',
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        unused: true,
        eqnull: true,
        browser: true,
        globals: {
          jQuery: true,
          ga: true
        },
        boss: true
      },
      gruntfile: {
        src: ['Gruntfile.js']
      },
      src: {
        src: 'src/**/*.js'
      }
    }
  });

  // Load NPM tasks
  for (var task in grunt.config('pkg').devDependencies) {
    if (task.substr(0,6) === 'grunt-' && task !== 'grunt-cli') {
      grunt.loadNpmTasks(task);
    }
  }

  // High-level tasks
  grunt.registerTask('default', 'Build and run', function (buildMode) {
    buildMode = verifyBuildMode(buildMode);

    if (grunt.option('watch')) {
      grunt.task.run('build:'+buildMode, 'watch');
    } else {
      grunt.task.run('build:'+buildMode);
    }
  });

  grunt.registerTask('build', 'Build the site', function (buildMode) {
    var tasks;

    buildMode = verifyBuildMode(buildMode);

    if (buildMode === 'release') {
      grunt.option('release-build', true);
    }

    tasks = [
      'jshint',
      'scsslint',
      'clean:dist',
      'copy:sass',
      'sass:'+buildMode,
      'concat:js'
    ];

    if (buildMode === 'release') {
      tasks.push('uglify', 'copy:bower_assets');
    }

    tasks.push('copy:section_partials', 'copy:other_assets');

    grunt.task.run.apply(grunt.task, tasks);
  });

  function verifyBuildMode(buildMode) {
    buildMode = buildMode || 'dev';
    if (buildMode !== 'dev' && buildMode !== 'release') {
      grunt.warn('unexpected build mode "'+buildMode+'"');
    }
    return buildMode;
  }
};
