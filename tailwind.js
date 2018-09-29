const colors = {
    'transparent': 'transparent',

    'off-black': '#222',
    'gray-light': '#f0f0f0',

    'primary': '#5076be',
    'primary-light': '#85afff',
    'primary-dark': '#243f71',
    'complement': '#f2b632',
}

const gridSize = 320

module.exports = {

    /*
    | Parameters exposed for use of the config helper. For example:
    |
    | .error { color: config('colors.red') }
    |
    */

    colors: colors,

    'grid-size': `${gridSize}px`,


    /*
    |---------------------------------------------------------------------------
    | Screens                    https://tailwindcss.com/docs/responsive-design
    |---------------------------------------------------------------------------
    |
    | Class name: .{screen}:{utility}
    |
    */

    screens: {
        'sm': (gridSize * 2) + 'px',
        'md': (gridSize * 3) + 'px',
    },


    /*
    |---------------------------------------------------------------------------
    | Fonts                                  https://tailwindcss.com/docs/fonts
    |---------------------------------------------------------------------------
    |
    | Class name: .font-{name}
    |
    */

    fonts: {
        'body': [
            // Web font
            'Lato',

            // Misc system fonts from the Tailwind defaults
            'system-ui',
            'BlinkMacSystemFont',
            '-apple-system',
            'Segoe UI',
            'Roboto',
            'Oxygen',
            'Ubuntu',
            'Cantarell',
            'Fira Sans',
            'Droid Sans',
            'Helvetica Neue',
            'sans-serif',
        ],

        'accent': [
            // Web font
            'Josefin Sans',

            // Misc system fonts from the Tailwind defaults
            'system-ui',
            'BlinkMacSystemFont',
            '-apple-system',
            'Segoe UI',
            'Roboto',
            'Oxygen',
            'Ubuntu',
            'Cantarell',
            'Fira Sans',
            'Droid Sans',
            'Helvetica Neue',
            'sans-serif',
        ],
    },


    /*
    |---------------------------------------------------------------------------
    | Text sizes                       https://tailwindcss.com/docs/text-sizing
    |---------------------------------------------------------------------------
    |
    | Class name: .text-{size}
    |
    */

    textSizes: {
        'xs': '.75rem',     // 12px
        'sm': '.875rem',    // 14px
        'base': '1rem',     // 16px
        'lg': '1.125rem',   // 18px
        'xl': '1.25rem',    // 20px
        '2xl': '1.5rem',    // 24px
        '3xl': '1.875rem',  // 30px
        '4xl': '2.25rem',   // 36px
        '5xl': '3rem',      // 48px
    },


    /*
    |---------------------------------------------------------------------------
    | Font weights                     https://tailwindcss.com/docs/font-weight
    |---------------------------------------------------------------------------
    |
    | Class name: .font-{weight}
    |
    */

    fontWeights: {
        'normal': 400,
        'bold': 700,
    },


    /*
    |---------------------------------------------------------------------------
    | Leading (line height)            https://tailwindcss.com/docs/line-height
    |---------------------------------------------------------------------------
    |
    | Class name: .leading-{size}
    |
    */

    leading: {
        'none': 1,
        'tight': 1.3,
        'normal': 1.5,
        'loose': 2,
    },


    /*
    |---------------------------------------------------------------------------
    | Tracking (letter spacing)     https://tailwindcss.com/docs/letter-spacing
    |---------------------------------------------------------------------------
    |
    | Class name: .tracking-{size}
    |
    */

    tracking: {
        'tight': '-0.05em',
        'normal': '0',
        'wide': '0.05em',
    },


    /*
    |---------------------------------------------------------------------------
    | Text colors                       https://tailwindcss.com/docs/text-color
    |---------------------------------------------------------------------------
    |
    | Class name: .text-{color}
    |
    */

    textColors: {
        'default': colors['off-black'],
        'link': colors['primary'],
        'link-hover': colors['primary-light'],
        'link-active': colors['complement'],
    },


    /*
    |---------------------------------------------------------------------------
    | Background colors           https://tailwindcss.com/docs/background-color
    |---------------------------------------------------------------------------
    |
    | Class name: .bg-{color}
    |
    */

    backgroundColors: colors,


    /*
    |---------------------------------------------------------------------------
    | Background sizes             https://tailwindcss.com/docs/background-size
    |---------------------------------------------------------------------------
    |
    | Class name: .bg-{size}
    |
    */

    backgroundSize: {
        'auto': 'auto',
        'cover': 'cover',
        'contain': 'contain',
    },


    /*
    |---------------------------------------------------------------------------
    | Border widths                   https://tailwindcss.com/docs/border-width
    |---------------------------------------------------------------------------
    |
    | Here is where you define your border widths. Take note that border
    | widths require a special "default" value set as well. This is the
    | width that will be used when you do not specify a border width.
    |
    | Class name: .border{-side?}{-width?}
    |
    */

    borderWidths: {
        default: '1px',
        '0': '0',
        '2': '2px',
        '4': '4px',
        '8': '8px',
    },


    /*
    |---------------------------------------------------------------------------
    | Border colors                   https://tailwindcss.com/docs/border-color
    |---------------------------------------------------------------------------
    |
    | Here is where you define your border colors. By default these use the
    | color palette we defined above, however you're welcome to set these
    | independently if that makes sense for your project.
    |
    | Take note that border colors require a special "default" value set
    | as well. This is the color that will be used when you do not
    | specify a border color.
    |
    | Class name: .border-{color}
    |
    */

    borderColors: global.Object.assign({ default: colors['gray-light'] }, colors),


    /*
    |---------------------------------------------------------------------------
    | Border radius                  https://tailwindcss.com/docs/border-radius
    |---------------------------------------------------------------------------
    |
    | Here is where you define your border radius values. If a `default` radius
    | is provided, it will be made available as the non-suffixed `.rounded`
    | utility.
    |
    | If your scale includes a `0` value to reset already rounded corners, it's
    | a good idea to put it first so other values are able to override it.
    |
    | Class name: .rounded{-side?}{-size?}
    |
    */

    borderRadius: {
        'none': '0',
        'sm': '.125rem',
        default: '.25rem',
        'lg': '.5rem',
        'full': '9999px',
    },


    /*
    |---------------------------------------------------------------------------
    | Width                                  https://tailwindcss.com/docs/width
    |---------------------------------------------------------------------------
    |
    | Class name: .w-{size}
    |
    */

    width: {
        'auto': 'auto',
        'px': '1px',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '24': '6rem',
        '32': '8rem',
        '48': '12rem',
        '64': '16rem',
        '1/2': '50%',
        '1/3': '33.33333%',
        '2/3': '66.66667%',
        '1/4': '25%',
        '3/4': '75%',
        '1/5': '20%',
        '2/5': '40%',
        '3/5': '60%',
        '4/5': '80%',
        '1/6': '16.66667%',
        '5/6': '83.33333%',
        'full': '100%',
        'screen': '100vw'
    },


    /*
    |---------------------------------------------------------------------------
    | Height                                https://tailwindcss.com/docs/height
    |---------------------------------------------------------------------------
    |
    | Class name: .h-{size}
    |
    */

    height: {
        'auto': 'auto',
        'px': '1px',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '24': '6rem',
        '32': '8rem',
        '48': '12rem',
        '64': '16rem',
        'full': '100%',
        'screen': '100vh'
    },


    /*
    |---------------------------------------------------------------------------
    | Minimum width                      https://tailwindcss.com/docs/min-width
    |---------------------------------------------------------------------------
    |
    | Here is where you define your minimum width utility sizes. These can
    | be percentage based, pixels, rems, or any other units. We provide a
    | couple common use-cases by default. You can, of course, modify
    | these values as needed.
    |
    | Class name: .min-w-{size}
    |
    */

    minWidth: {
        '0': '0',
        'full': '100%',
    },


    /*
    |---------------------------------------------------------------------------
    | Minimum height                    https://tailwindcss.com/docs/min-height
    |---------------------------------------------------------------------------
    |
    | Class name: .min-h-{size}
    |
    */

    minHeight: {
        '0': '0',
        'full': '100%',
        'screen': '100vh'
    },


    /*
    |---------------------------------------------------------------------------
    | Maximum width                      https://tailwindcss.com/docs/max-width
    |---------------------------------------------------------------------------
    |
    | Class name: .max-w-{size}
    |
    */

    maxWidth: {
        'xs': '20rem',
        'sm': '30rem',
        'md': '40rem',
        'lg': '50rem',
        'xl': '60rem',
        '2xl': '70rem',
        '3xl': '80rem',
        '4xl': '90rem',
        '5xl': '100rem',
        'full': '100%',
    },


    /*
    |---------------------------------------------------------------------------
    | Maximum height                    https://tailwindcss.com/docs/max-height
    |---------------------------------------------------------------------------
    |
    | Class name: .max-h-{size}
    |
    */

    maxHeight: {
        'full': '100%',
        'screen': '100vh',
    },


    /*
    |---------------------------------------------------------------------------
    | Padding                              https://tailwindcss.com/docs/padding
    |---------------------------------------------------------------------------
    |
    | Class name: .p{side?}-{size}
    |
    */

    padding: {
        'px': '1px',
        '0': '0',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '20': '5rem',
        '24': '6rem',
        '32': '8rem',
    },


    /*
    |---------------------------------------------------------------------------
    | Margin                                https://tailwindcss.com/docs/margin
    |---------------------------------------------------------------------------
    |
    | Class name: .m{side?}-{size}
    |
    */

    margin: {
        'auto': 'auto',
        'px': '1px',
        '0': '0',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '20': '5rem',
        '24': '6rem',
        '32': '8rem',
    },


    /*
    |---------------------------------------------------------------------------
    | Negative margin              https://tailwindcss.com/docs/negative-margin
    |---------------------------------------------------------------------------
    |
    | Class name: .-m{side?}-{size}
    |
    */

    negativeMargin: {
        'px': '1px',
        '0': '0',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '20': '5rem',
        '24': '6rem',
        '32': '8rem',
    },


    /*
    |---------------------------------------------------------------------------
    | Shadows                              https://tailwindcss.com/docs/shadows
    |---------------------------------------------------------------------------
    |
    | If a `default` shadow is provided, it will be made available as the non-
    | suffixed `.shadow` utility.
    |
    | Class name: .shadow-{size?}
    |
    */

    shadows: {
        default: '0 2px 4px 0 rgba(0,0,0,0.10)',
        'md': '0 4px 8px 0 rgba(0,0,0,0.12), 0 2px 4px 0 rgba(0,0,0,0.08)',
        'lg': '0 15px 30px 0 rgba(0,0,0,0.11), 0 5px 15px 0 rgba(0,0,0,0.08)',
        'inner': 'inset 0 2px 4px 0 rgba(0,0,0,0.06)',
        'outline': '0 0 0 3px rgba(52,144,220,0.5)',
        'none': 'none',
    },


    /*
    |---------------------------------------------------------------------------
    | Z-index                              https://tailwindcss.com/docs/z-index
    |---------------------------------------------------------------------------
    |
    | Class name: .z-{index}
    |
    */

    zIndex: {
        'auto': 'auto',
        '0': 0,
        '10': 10,
        '20': 20,
        '30': 30,
        '40': 40,
        '50': 50,
    },


    /*
    |---------------------------------------------------------------------------
    | Opacity                              https://tailwindcss.com/docs/opacity
    |---------------------------------------------------------------------------
    |
    | Class name: .opacity-{name}
    |
    */

    opacity: {
        '0': '0',
        '25': '.25',
        '50': '.5',
        '75': '.75',
        '100': '1',
    },


    /*
    |---------------------------------------------------------------------------
    | SVG fill                                 https://tailwindcss.com/docs/svg
    |---------------------------------------------------------------------------
    |
    | Class name: .fill-{name}
    |
    */

    svgFill: {
        'current': 'currentColor',
    },


    /*
    |---------------------------------------------------------------------------
    | SVG stroke                               https://tailwindcss.com/docs/svg
    |---------------------------------------------------------------------------
    |
    | Class name: .stroke-{name}
    |
    */

    svgStroke: {
        'current': 'currentColor',
    },


    /*
    |---------------------------------------------------------------------------
    | Modules                https://tailwindcss.com/docs/configuration#modules
    |---------------------------------------------------------------------------
    |
    | Currently supported variants:
    |   - responsive
    |   - hover
    |   - focus
    |   - active
    |   - group-hover
    |
    | To disable a module completely, use `false` instead of an array.
    |
    */

    modules: {
        appearance: ['responsive'],
        backgroundAttachment: ['responsive'],
        backgroundColors: ['responsive', 'hover', 'focus'],
        backgroundPosition: ['responsive'],
        backgroundRepeat: ['responsive'],
        backgroundSize: ['responsive'],
        borderCollapse: [],
        borderColors: ['responsive', 'hover', 'focus'],
        borderRadius: ['responsive'],
        borderStyle: ['responsive'],
        borderWidths: ['responsive'],
        cursor: ['responsive'],
        display: ['responsive'],
        flexbox: ['responsive'],
        float: ['responsive'],
        fonts: ['responsive'],
        fontWeights: ['responsive', 'hover', 'focus'],
        height: ['responsive'],
        leading: ['responsive'],
        lists: ['responsive'],
        margin: ['responsive'],
        maxHeight: ['responsive'],
        maxWidth: ['responsive'],
        minHeight: ['responsive'],
        minWidth: ['responsive'],
        negativeMargin: ['responsive'],
        opacity: ['responsive'],
        outline: ['focus'],
        overflow: ['responsive'],
        padding: ['responsive'],
        pointerEvents: ['responsive'],
        position: ['responsive'],
        resize: ['responsive'],
        shadows: ['responsive', 'hover', 'focus'],
        svgFill: [],
        svgStroke: [],
        tableLayout: ['responsive'],
        textAlign: ['responsive'],
        textColors: ['responsive', 'hover', 'focus'],
        textSizes: ['responsive'],
        textStyle: ['responsive', 'hover', 'focus'],
        tracking: ['responsive'],
        userSelect: ['responsive'],
        verticalAlign: ['responsive'],
        visibility: ['responsive'],
        whitespace: ['responsive'],
        width: ['responsive'],
        zIndex: ['responsive'],
    },


    /*
    |---------------------------------------------------------------------------
    | Plugins                              https://tailwindcss.com/docs/plugins
    |---------------------------------------------------------------------------
    */

    plugins: [
        require('./tailwind-plugins/spaced-descendants')({
            selectors: ['p', 'h1', 'h2'],
        }),
    ],


    /*
    |---------------------------------------------------------------------------
    | Advanced Options       https://tailwindcss.com/docs/configuration#options
    |---------------------------------------------------------------------------
    */

    options: {
        prefix: '',
        important: false,
        separator: ':',
    },

}
