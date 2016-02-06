set -e

ROOT=$1


echo "Updating package listings"
sudo apt-get -qq update


echo "Installing Node"

# Add a PPA to get Node
if ! grep -q nodesource /etc/apt/sources.list /etc/apt/sources.list.d/*; then
    curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
fi

sudo apt-get install -y nodejs


echo "Installing Ruby"

ruby_version=2.3.0

if [[ ! `ruby --version` == *"$ruby_version"* ]]; then
    curl -sSL https://get.rvm.io | bash
    source .rvm/scripts/rvm
    rvm install ruby-$ruby_version
fi


echo "Installing other dependencies"

gem install jekyll -v 3.1.0

(
    cd "$ROOT"

    ./install-build-deps.sh

    npm install
)
