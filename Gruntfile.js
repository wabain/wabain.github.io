module.exports = function (grunt) {
    'use strict';
    // Project configuration
    grunt.initConfig({
        // Metadata
        pkg: grunt.file.readJSON('package.json'),
        banner: '<%= pkg.name %> v<%= pkg.version %> '+
            '<%= grunt.option("release") ? "" : "[dev build]" %>, ' +
            '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
            '   Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>',
        // Task configuration
        clean: {
            dist: ['./dist/**', '!dist'],
            dev: ['tmp-dev/**']
        },
        concat: {
            options: {
                banner: '/* <%= banner %> */\n',
                stripBanners: true
            },
            dist: {
                src: ['src/js/**/*.js'],
                dest: 'dist/home-assets/cs-homepage.js'
            }
        },
        uglify: {
            options: {
                banner: '/* <%= banner %> */',
                sourceMap: true,
                // Default is to remove the .js
                sourceMapName: function (name) {return name+'.map';}
            },
            dist: {
                src: '<%= concat.dist.dest %>',
                dest: 'dist/home-assets/cs-homepage.min.js'
            }
        },
        copy: {
            distScss: {
                options: {
                    // Prepend the banner
                    process: function (content) {
                        return '/* '+grunt.config('banner')+' */'+'\n'+content;
                    }
                },
                files: [
                    {
                        expand: true,
                        cwd: 'src/scss/',
                        src: 'cs-homepage.scss',
                        dest: 'dist/home-assets/'
                    }
                ]
            },
            distVendor: {
                files: [
                    {
                        expand: true,
                        cwd: 'bower_components/html5shiv/dist/',
                        src: 'html5shiv.min.js',
                        dest: 'dist/home-assets/'
                    }
                ]
            }
        },
        /* Sass loses out on compression a bit relative to cssmin (color names,
           0px vs 0) but it does source maps and it's good enough */
        sass: {
            dist: {
                options: {
                    style: 'compressed',
                    sourcemap: true
                },
                src: 'dist/home-assets/cs-homepage.scss',
                dest: 'dist/home-assets/cs-homepage.min.css'
            },
            dev: {
                options: {
                    style: 'expanded',
                    sourcemap: true
                },
                src: 'src/scss/cs-homepage.scss',
                dest: 'tmp-dev/cs-homepage.css'
            }
        },
        template: {
            dist: {
                options: {
                    data: {
                        index_banner: '<%= banner.replace(/\\n\\s*/, "\\n     ") %>',
                        version: '<%= pkg.version %>',
                        cookieDomain: '<%= grunt.option("release") ? "cs.mcgill.ca" : "none" %>',
                        cookiePath: '<%= grunt.option("release") ? "/~wbain" : "/" %>',
                        sections: {
                            about: 'sections/about.html',
                            projects: 'sections/projects.html',
                            cv: 'sections/cv.html'
                        },
                        scripts: {
                            html5shiv: 'home-assets/html5shiv.min.js',
                            jquery: '//code.jquery.com/jquery-1.11.0.min.js',
                            enhancement: 'home-assets/cs-homepage.min.js',
                            // enhancement: '<%= uglify.dist.dest %>'
                            analytics: 'src/inline/init-analytics.js'
                        },
                        styles: {
                            page: 'home-assets/cs-homepage.min.css'
                            // page: '<%= sass.dist.dest %>'
                        },
                        readFile: readFile
                    }
                },
                src: 'src/index.html',
                dest: 'dist/index.html'
            },
            dev: {
                options: {
                    data: {
                        index_banner: 'Local dev build at <%= grunt.template.today("yyyy-mm-dd hh:MM") %>',
                        version: '<%= pkg.version %>',
                        cookieDomain: 'none',
                        cookiePath: '/',
                        sections: {
                            about: 'sections/about.html',
                            projects: 'sections/projects.html',
                            cv: 'sections/cv.html'
                        },
                        scripts: {
                            html5shiv: '../bower_components/html5shiv/dist/html5shiv.js',
                            jquery: '../bower_components/jquery/dist/jquery.js',
                            enhancement: '../src/js/home-navigation.js',
                            analytics: '<%= grunt.option("dev-analytics") ? "src/inline/init-analytics.js" : null %>'
                        },
                        styles: {
                            page: 'cs-homepage.css'
                        },
                        readFile: readFile
                    }
                },
                src: 'src/index.html',
                dest: 'tmp-dev/index.html'
            }
        },
        jsbeautifier: {
            options: {
                html: {
                    indentSize: 2,
                    indentScripts: 'keep'
                }
            },
            dist: {
                src: ['dist/index.html']
            },
            dev: {
                src: ['tmp-dev/index.html']
            }
        },
        watch: {
            options: {
                spawn: true
            },
            devScss: {
                files: ['src/scss/**/*.scss'],
                tasks: ['sass:dev']
            },
            devIndex: {
                files: ['src/index.html', 'sections/**'],
                tasks: ['template:dev']
            },
            jshint: {
                files: ['gruntfile.js', 'src/**/*.js', 'test/**/*.js'],
                tasks: ['jshint']
            }
        },
        concurrent: {
            options: {
                logConcurrentOutput: true
            },
            dev: ['watch:devScss', 'watch:devIndex', 'watch:jshint']
        },
        'http-server': {
            dev: {
                port: 8282,
                host: "127.0.0.1",
                runInBackground: true
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
                src: 'gruntfile.js'
            },
            src_test: {
                src: ['src/**/*.js', 'test/**/*.js']
            }
        },
        // Not yet implemented
        qunit: {
            files: ['test/**/*.html']
        }
    });

    // Load NPM tasks
    for (var task in grunt.config('pkg').devDependencies) {
        if (task.substr && task.substr(0,6) === 'grunt-') {
            grunt.loadNpmTasks(task);
        }
    }

    // High-level tasks
    grunt.registerTask('default', ['jshint', 'clean:dist', 'concat',
            'uglify', 'copy:distVendor', 'copy:distScss', 'sass:dist',
            'template:dist', 'jsbeautifier:dist']);

    grunt.registerTask('build-dev', ['jshint', 'clean:dev', 'sass:dev',
            'template:dev', 'jsbeautifier:dev']);

    grunt.registerTask('watch-dev', ['concurrent:dev']);

    grunt.registerTask('run-dev', ['build-dev', 'http-server:dev', 'watch-dev']);

    function readFile(fname) {
        return grunt.file.read(fname).replace(/\s*$/, '');
    }
};
