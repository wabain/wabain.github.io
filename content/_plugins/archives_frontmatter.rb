module ArchivesFrontmatter
  class ArchivesFrontmatterGenerator < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      site.pages.each do |page|
        # Hack: jekyll-archives doesn't look up YAML frontmatter
        if page.is_a?(Jekyll::Archives::Archive) && page.data.default_proc.nil?
          Jekyll.logger.debug "Archives data:", "Set frontmatter defaults for #{page.relative_path}"

          page.data.default_proc = proc do |_, key|
            site.frontmatter_defaults.find(page.relative_path, page.type, key)
          end
        end
      end
    end
  end
end
