# To be invoked using `yarn run jekyll-lint [...]`

require 'optparse'
require 'html-proofer'
require_relative 'htmlproof_link_target'

def parse_options!
  options = {
    :external => false,
  }

  parser = OptionParser.new do |opts|
    opts.banner = "Usage: yarn run jekyll-lint [options]"

    opts.on("-x", "--[no-]external", "Check reachability of external links") do |x|
      options[:external] = x
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
  :disable_external => !options[:external],
  :ignore_files => [/^_site\/section-partial/],
  :enforce_https => false,  # FIXME: would be good in general, but need a way to allowlist external http links
})

begin
  proofer.run
rescue RuntimeError => e
  STDERR.puts e.message
  exit! 1
end
