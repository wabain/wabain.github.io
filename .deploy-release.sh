#!/usr/bin/bash

set -e

# https://gist.github.com/davejamesmiller/1965569
function ask {
    while true; do
        if [ "${2:-}" = "Y" ]; then
            prompt="Y/n"
            default=Y
        elif [ "${2:-}" = "N" ]; then
            prompt="y/N"
            default=N
        else
            prompt="y/n"
            default=
        fi
        # Ask the question
        read -p "$1 [$prompt] " REPLY
        # Default?
        if [ -z "$REPLY" ]; then
            REPLY=$default
        fi
        # Check if the reply is valid
        case "$REPLY" in
            Y*|y*) return 0 ;;
            N*|n*) return 1 ;;
        esac
    done
}

ask "Overwrite files on mimi.cs.mcgill.ca?" || exit

ssh mimi.cs.mcgill.ca cd ~/public_html; \rm -r home-assets
scp -r index.html home-assets mimi.cs.mcgill.ca:~/public_html
ssh mimi.cs.mcgill.ca cd ~/public_html; chmod 755 home-assets; chmod 644 index.html home-assets/*
