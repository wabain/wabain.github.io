module.exports = function (grunt) {
    'use strict';
    // Project configuration
    grunt.initConfig({
        // Metadata
        pkg: grunt.file.readJSON('package.json'),
        banner: '<%= pkg.name %> v<%= pkg.version %>, ' +
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
            options: {
                // Prepend the banner
                process: function (content) {
                    return '/* '+grunt.config('banner')+' */'+'\n'+content;
                }
            },
            distScss: {
                files: [
                    {
                        expand: true,
                        cwd: 'src/scss/',
                        src: 'cs-homepage.scss',
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
                src: 'dist/home-assets/cs-homepage.scss',
                dest: 'tmp-dev/cs-homepage.css'
            }
        },
        template: {
            dist: {
                options: {
                    data: {
                        index_banner: '<%= banner %>',
                        sections: {
                            about: 'sections/about.html',
                            projects: 'sections/projects.html',
                            cv: 'sections/cv.html'
                        },
                        scripts: {
                            jquery: 'http://code.jquery.com/jquery-1.11.0.min.js',
                            enhancement: 'home-assets/cs-homepage.min.js'
                            // enhancement: '<%= uglify.dist.dest %>'
                        },
                        styles: {
                            page: 'home-assets/cs-homepage.min.css'
                            // page: '<%= sass.dist.dest %>'
                        }
                    }
                },
                src: 'src/index.html',
                dest: 'dist/index.html'
            },
            dev: {
                options: {
                    data: {
                        index_banner: 'Dev build at <%= grunt.template.today("yyyy-mm-dd hh:MM") %>',
                        sections: {
                            about: 'sections/about.html',
                            projects: 'sections/projects.html',
                            cv: 'sections/cv.html'
                        },
                        scripts: {
                            jquery: '../bower_components/jquery/dist/jquery.js',
                            enhancement: '../src/js/home-navigation.js'
                        },
                        styles: {
                            page: 'cs-homepage.css'
                        }
                    }
                },
                src: 'src/index.html',
                dest: 'tmp-dev/index.html'
            }
        },
        jsbeautifier: {
            options: {
                html: {
                    indentSize: 2
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
            }
        },
        concurrent: {
            options: {
                logConcurrentOutput: true
            },
            dev: ['watch:devScss', 'watch:devIndex']
        },
        jshint: {
            options: {
                node: true,
                // curly: true,
                eqeqeq: true,
                immed: true,
                latedef: true,
                newcap: true,
                noarg: true,
                sub: true,
                undef: true,
                unused: true,
                eqnull: true,
                browser: true,
                globals: { jQuery: true },
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
            'uglify', 'copy:distScss', 'sass:dist', 'template:dist',
            'jsbeautifier:dist']);

    grunt.registerTask('rundev', ['jshint', 'clean:dev', 'sass:dev',
            'template:dev', 'jsbeautifier:dev', 'concurrent:dev']);
};
