# To be invoked using `yarn run jekyll-lint [...]`

require 'optparse'
require 'html-proofer'
require_relative 'htmlproof_link_target'

def parse_options!
  options = {
    :external => false,
    :origin => "wabain.github.io",
  }

  parser = OptionParser.new do |opts|
    opts.banner = "Usage: yarn run jekyll-lint [options]"

    opts.on("-x", "--[no-]external", "Check reachability of external links") do |x|
      options[:external] = x
    end

    opts.on("-oORIGIN", "--origin=ORIGIN", "Set origin (domain and optional port) of the site") do |d|
      options[:origin] = d
    end
  end

  parser.parse!

  if !ARGV.empty?
    STDERR.puts "Unexpected positional arguments"
    STDERR.puts "\n"
    STDERR.puts parser.help()
    exit! 2
  end

  options
end

options = parse_options!

# Current directory should be forced by invoking through yarn
proofer = HTMLProofer.check_directory("_site", {
  :assume_extension => true,
  :disable_external => !options[:external],
  :check_html => true,
  :file_ignore => [/^_site\/section-partial/],
  :link_target_ignore_domains => [options[:origin]],
})

begin
  proofer.run
rescue RuntimeError => e
  STDERR.puts e.message
  exit! 1
end
