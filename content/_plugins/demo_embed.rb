require 'digest'

require 'nokogiri'
require 'crass'

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

      quasi_sandbox(content[8..-4]) + "\n" + super
    end

    private

    # Prepend a prefix unique to this demo to each element identifier and CSS
    # class to avoid some CSS collisions.
    #
    # This implementation has some known limitations and is DEFINITELY not
    # secure for untrusted content.
    #
    # Among the limitations:
    #
    # * Does not namespace some known global CSS identifiers, such as animation
    #   names
    # * Does not try to rewrite local fragment hrefs
    def quasi_sandbox(src)
      prefix = css_prefix src

      frag = Nokogiri::HTML::fragment src

      frag.css('style').each do |style|
        tree = Crass.parse(style.content, :preserve_comments => true)
        tree.each do |node| visit_css prefix, node end
        style.content = Crass::Parser.stringify tree
      end

      frag.css('*').each do |elem|
        if elem['id']
          elem['id'] = prefix + elem['id']
        end

        if elem['class']
          elem['class'] = elem['class'].gsub(/(^|\s+)(.*?)($|\s+)/, '\1' + prefix + '\2\3')
        end
      end

      container = frag.document.create_element "div", :id => quasi_sandbox_root_id(prefix)
      container.prepend_child frag

      container.serialize
    end

    def visit_css(prefix, node)
      case node[:node]
      when :selector
        visit_selector prefix, node

      else
        visit_unknown prefix, node
      end
    end

    def visit_unknown(prefix, node)
      node.each do |_, v|
        if v.is_a?(Hash)
          if v.include?(:node)
            visit_css prefix, v
          end

        elsif v.is_a?(Array)
          v.each do |elem|
            if v.is_a?(Hash) && v.include?(:node)
              visit_css prefix, v
            end
          end
        end
      end
    end

    def visit_selector(prefix, node)
      needs_prefix = false
      need_root = [0]

      node[:tokens].each_with_index do |tok, i|
        case tok[:node]
        when :delim
          case tok[:value]
          when ".", "#"
            needs_prefix = true
          end

          next

        when :comma
          if node[:tokens][i + 1][:node] == :whitespace
            need_root.push i + 2
          else
            need_root.push i + 1
          end

        when :ident
          if needs_prefix
            tok[:raw] = prefix + tok[:raw]
            tok[:value] = prefix + tok[:value]
          end
        end

        needs_prefix = false
      end

      # Prepend the root element id at the start of each rule
      root_id = quasi_sandbox_root_id prefix
      need_root.reverse.each do |i|
        node[:tokens][i, 0] = [
          { :node => :delim, :pos => 0, :raw => '#', :value => '#' },
          { :node => :ident, :pos => 0, :raw => root_id, :value => root_id },
          { :node => :whitespace, :pos => 0, :raw => ' ' },
        ]
      end
    end

    def quasi_sandbox_root_id(prefix)
      "root-#{prefix[0..-2]}"
    end

    def css_prefix(content)
      hash = Digest::SHA256.base64digest content
      hash = hash.sub(/=*$/, '')
      hash = hash.gsub /\+/, '-'
      hash = hash.gsub /\//, '_'
      'demo-' + hash + '-'
    end
  end

  Liquid::Template.register_tag('demoembed', DemoEmbedBlock)
end
