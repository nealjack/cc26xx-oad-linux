# cc26xx-oad-linux
#### A utility to update TI cc26xx family firmware using node.js on Linux
Tested on Ubuntu 14.04 LTS, Raspbian.

### Install
This repo requires node.js and the node.js package manager be installed (npm), as well as linux bluetooth sources.

```
sudo apt-get install bluetooth bluez-utils libbluetooth-dev
```

#### Ubuntu
```
sudo apt-get install node npm
```

You'll want to be sure you have the latest version of node.js and npm.
```
node -v // 0.12.7 at the time of this writing
npm -v // 2.11.3
```
#### Raspbian
This isn't as easy, as node.js is very outdated in Raspbian's repositories. It is recommended to [download](https://nodejs.org/download/) the source and build it. It will take a couple of hours to compile from source on the Raspberry Pi.

```
tar -xzf node-v0.12.7.tar.gz
cd node-v0.12.7
./configure
make
sudo make install
```

#### Node Modules

```
npm install noble minimist prompt progress
```

### Running

#### Command Line Arguments

`-h` will display a help message

`-y` is optional and will skip prompting user to start programming

`-b XX:XX:XX:XX:XX:XX` allows providing a BLE address. If not provided, the utility will perform a scan and allow the user to pick from a list of discovered devices.

`-f <filename>` provides the firmware file location

#### Firmware .bin files

Users must provide their own firmware. Versions of the SensorTag firmware are available from TI's website.
