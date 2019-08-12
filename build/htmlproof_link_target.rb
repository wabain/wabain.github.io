require 'html-proofer'

class LinkTargetCheck < ::HTMLProofer::Check
  def extern_link?(link)
    return false unless link.remote?

    ignore_domains = @options[:link_target_ignore_domains] || []

    origin_domain = link.parts.host
    if link.parts.port != nil
      origin_domain += ":#{link.parts.port}"
    end

    !ignore_domains.include?(origin_domain)
  end

  def run
    @html.css('a').each do |node|
      link = create_element(node)

      if link.data_proofer_ignore || link.href.nil?
        next
      end

      target =
        if node.attributes.has_key? 'target'
          node.attributes['target'].value
        else
          nil
        end

      if extern_link?(link) && target != '_blank'
        line = node.line

        target_value =
          if target == nil
            'no target'
          else
            "target=#{target}"
          end

        return add_issue("External link #{link.href} must have target=_blank (#{target_value} given)", line: line)
      end
    end
  end
end