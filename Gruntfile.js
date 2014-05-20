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
            dist: ['./dist/**', '!dist']
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
            distCss: {
                options: {
                    // Prepend the banner
                    process: function (content) {
                        return '/* '+grunt.config('banner')+' */'+'\n'+content;
                    }
                },
                files: [
                    {
                        expand: true,
                        flatten: true,
                        filter: 'isFile',
                        cwd: 'src/css/',
                        src: '**/*.css',
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
                src: 'dist/home-assets/**/*.css',
                dest: 'dist/home-assets/cs-homepage.min.css'
            }
        },
        htmlbuild: {
            dist: {
                src: 'src/index.html',
                dest: 'dist/',
                options: {
                    beautify: true,
                    relative: true,
                    sections: {
                        about: 'sections/about.html',
                        projects: 'sections/projects.html',
                        cv: 'sections/cv.html',
                        jQueryScript: 'sections/jqscript.html' // what a terrible hack
                    },
                    styles: {
                        page: '<%= sass.dist.dest %>'
                    },
                    scripts: {
                        enhancement: '<%= uglify.dist.dest %>'
                    }
                },
                data: {
                    banner: '<!-- <%= banner %> -->'
                }
            }
        },
        usebanner: {
            index: {
                options: {
                    banner: '<!-- <%= banner %> -->',
                },
                src: 'dist/index.html'
            }
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

    // These plugins provide necessary tasks
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-qunit');
    grunt.loadNpmTasks('grunt-contrib-sass');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-banner');
    grunt.loadNpmTasks('grunt-html-build');

    // Default task
    grunt.registerTask('default', ['jshint', 'clean:dist', 'concat', 'uglify', 'copy:distCss', 'sass', 'htmlbuild', 'usebanner:index']);
};
