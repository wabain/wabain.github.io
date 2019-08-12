module Partials
  class PartialGenerator < Jekyll::Generator
    safe true
    priority :lowest

    def generate(site)
      partials = Jekyll::Collection.new(site, "section-partial")
      partials.metadata["output"] = true

      site.pages.each do |page|
        fpath = File.join(partials.directory, page.dir, page.name)

        Jekyll.logger.debug "Partials:", "Generating from page #{page.relative_path}"
        partials.docs << PartialDocument.new(page, fpath, {
          :site => partials.site,
          :collection => partials
        })
      end

      site.collections.each do |collection_name, collection|
        collection.docs.each do |doc|
          # For posts, this can give paths like _section-partial/_posts/... or
          # _section-partial/_drafts/..., but that doesn't seem to cause any harm
          fpath = File.join(partials.directory, doc.relative_path)

          Jekyll.logger.debug "Partials:", "Generating from #{collection_name} #{doc.relative_path}"
          partials.docs << PartialDocument.new(doc, fpath, {
            :site => partials.site,
            :collection => partials
          })
        end
      end

      site.collections["section-partial"] = partials
    end
  end

  class PartialDocument < Jekyll::Document
    def initialize(target, path, relations = {})
      super(path, relations)

      if target.is_a? Jekyll::Page
        @data = target.data.clone
        self.content = target.content
      elsif target.is_a? Jekyll::Document
        @data = target.data.clone
        self.content = target.content
      else
        raise ArgumentError, "unexpected partial target #{target}"
      end

      # Greedily copy across template-defined attributes
      if defined? target.class::ATTRIBUTES_FOR_LIQUID
        target.class::ATTRIBUTES_FOR_LIQUID.each do |attrib|
          @data[attrib] = target.send(attrib)
        end
      end

      @url = "/section-partial" + target.url

      partial_layout = self.data["partial_layout"]
      if partial_layout == nil
        raise ArgumentError, "no 'partial_layout' key provided for #{path}"
      end
      self.data["layout"] = partial_layout

      # Hardcode the sitemap value
      self.data["sitemap"] = false
    end
  end
end
