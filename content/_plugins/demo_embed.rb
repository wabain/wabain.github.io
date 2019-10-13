module DemoEmbed

  # Quick-and-dirty support for embedding HTML demos alongside their
  # markdown source
  class DemoEmbedBlock < Liquid::Block
    def initialize(tag_name, markup, tokens)
       super
    end

    def render(context)
      content = super.strip

      if !content.start_with? "```html\n"
        throw "demo embed is expected to start with ```html"
      end

      if !content.end_with? "\n```"
        throw "demo embed is expected to end with ```"
      end

      content[8..-4] + "\n" + super
    end
  end

  Liquid::Template.register_tag('demoembed', DemoEmbedBlock)
end
