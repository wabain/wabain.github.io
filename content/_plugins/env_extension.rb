# frozen_string_literal: true

require "jekyll"
require "json"

module Hooks
  extend self

  def install
    return if @installed
    @installed = true

    Jekyll::Hooks.register :site, :post_read do |site|
      update_site_data! site
    end

    Jekyll::Hooks.register :site, :after_reset do |site|
      update_site_data! site
    end
  end

  private

  @installed = false

  def update_site_data! site
    cwd = File.dirname(__FILE__)

    src = ''
    IO.popen(["node", "env_extension.js"], :chdir => cwd) {|node_io|
      src = node_io.read
    }

    site.config["env"] = JSON.parse(src)
  end
end

Hooks.install
