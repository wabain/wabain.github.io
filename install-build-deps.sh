gem install --version 0.29.0 scss-lint

# Needed because of https://github.com/assemble/handlebars-helpers/issues/199 :
if [[ `which npm` == /usr/bin/npm ]]; then
    sudo npm install -g npm@^'2.14.0'
else
    npm install -g npm@^'2.14.0'
fi
