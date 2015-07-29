var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var prompt = require('prompt');
var ImgHdr = require('./ImgHdr');
var binary = require('./Binary');

//console.dir(argv);

// Programming parameters
var OAD_CONN_INTERVAL = 6; // 15 milliseconds
var OAD_SUPERVISION_TIMEOUT = 50; // 500 milliseconds
//var GATT_WRITE_TIMEOUT = 50; // Milliseconds

// OAD parameters
var OAD_SERVICE = 'f000ffc004514000b000000000000000';
var IMG_IDENTIFY_CHAR = 'f000ffc104514000b000000000000000';
var IMG_BLOCK_CHAR = 'f000ffc204514000b000000000000000';
var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;

var CONNECTION_PARAMS_SERVICE = 'f000ccc004514000b000000000000000';
var CONN_PARAMS_CHAR = 'f000ccc104514000b000000000000000';
var CONN_PARAMS_REQ_CHAR = 'f000ccc204514000b000000000000000';

var SCAN_TIMEOUT = 10000; // 10 seconds

//var discovered = new Array();
var fwUpdate = FwUpdate_CC26xx(argv);

function FwUpdate_CC26xx(argv) {
  var self = this;
  this.targetUuid = null;
  this.targetDevice = null;
  this.fileBuffer = null;
  this.imgHdr = null;

  this.scanTimer = null;
  //this.writeBlockTimer = null;

  this.img_nBlocks = null;
  this.img_iBlocks = 0;
  this.programming = true;
  this.imgIdentifyChar = null;
  this.imgBlockChar = null;

  if(argv.h)
  {
    print_help();
  }
  if(!argv.b || !argv.f)
  {
    console.log('invalid command line options');
    print_help();
  }
  else if(argv.b)
  {
    this.targetUuid = argv.b.match(/[0-9a-fA-F][^:]/g).join('').toLowerCase();
    if(this.targetUuid.length != 12)
    {
      console.log('invalid ble address');
      print_help();
    }
  }

  fs.readFile(argv.f, function init(err, data) {
    if (err) throw err;
    self.fileBuffer = data;
    img_nBlocks = self.fileBuffer.length / OAD_BLOCK_SIZE;
    self.imgHdr = new ImgHdr(data);
    noble.on('discover', _discoverDevice);
    noble.on('stateChange', function (state) {
        console.log("Starting scan...");
        if (state === 'poweredOn') {
          noble.startScanning([], false);
          self.scanTimer = setTimeout(function() {
            console.log('Scanning timed out, ensure peripheral is advertising.');
            process.exit();
          }, SCAN_TIMEOUT);
        }
        else {
          noble.stopScanning();
        }
    });
  });

  function _discoverDevice(peripheral) {
    console.log('discovered device: ' + peripheral.uuid.match(/../g).join(':'));
    if(peripheral.uuid === self.targetUuid) {
      clearTimeout(self.scanTimer);
      noble.stopScanning();
      self.targetDevice = peripheral;
      console.log('found requested peripheral ' + self.targetUuid.match(/../g).join(':'))
      self.targetDevice.connect(function(err) {
        if(err) throw err;
        console.log('connected to ' + self.targetUuid.match(/../g).join(':'));
        _prepareDevice();
      });
      self.targetDevice.on('disconnect', function() {
        console.log('disconnected from ' + self.targetUuid.match(/../g).join(':'));
        process.exit(0);
      });
    }
  }

  function test() {
    console.log('blah');
  }

  function _prepareDevice() {
    _setConnectionParams(function() {
      _printFirmware(function() {
        _oadProgram();
      });
    });
  }

  function _printFirmware(callback) {
    var service_uuids = ['180a'];
    var characteristic_uuids = ['2a26'];
    self.targetDevice.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
    function(err, services, characteristics) {

      chars_servs_exist(err, services, characteristics);

      characteristics[0].read(function(err, data) {
        if(err) throw err;
        console.log('Current device firmware is ' + data.toString('ascii'));
        if(callback) callback();
      });
    });
  }

  function _setConnectionParams(callback) {
    var service_uuids = [CONNECTION_PARAMS_SERVICE];
    var characteristic_uuids = [CONN_PARAMS_CHAR, CONN_PARAMS_REQ_CHAR];
    self.targetDevice.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
    function(err, services, characteristics) {

      //TODO better check for existing characteristics/services
      if(!characteristics[0]) {
        throw new Error('characteristic0 doesn\'t exist!');
      }
      else if(!characteristics[1]) {
        throw new Error('characteristic1 doesn\'t exist');
      }

      var conn_params_char = characteristics[0];
      conn_params_char.read(function(err, data) {
        if(err) throw err;
      });
      conn_params_char.notify(true, function(err) {
        conn_params_char.on('data', function(data, notification) {
          console.log('successfully wrote new connection parameters');
          callback();
        });
      });

      var conn_params_req_char = characteristics[1];
      var param_buf = new Buffer([binary.loUint16(OAD_CONN_INTERVAL), binary.hiUint16(OAD_CONN_INTERVAL),
                                  binary.loUint16(OAD_CONN_INTERVAL), binary.hiUint16(OAD_CONN_INTERVAL),
                                  0,0,
                                  binary.loUint16(OAD_SUPERVISION_TIMEOUT), binary.hiUint16(OAD_SUPERVISION_TIMEOUT)]);
      conn_params_req_char.write(param_buf, false, function(err) {
        if(err) throw err;
      });
    });
  }

  function _oadProgram() {
    // OAD service
    var service_uuids = [OAD_SERVICE];
    // Img Identify, Img Block
    var characteristic_uuids = [IMG_IDENTIFY_CHAR, IMG_BLOCK_CHAR];
    self.targetDevice.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
    function(err, services, characteristics) {

      chars_servs_exist(err, services, characteristics);
      self.imgIdentifyChar = characteristics[0];
      self.imgBlockChar = characteristics[1];
      console.log('ready to program device ' + self.targetDevice.uuid.match(/../g).join(':'));

      prompt.start();
      console.log('start? (y/n)');
      prompt.get(['start'], function (err, result) {
        if(err) throw err;
        if(result.start !== 'y') {
          self.targetDevice.disconnect();
        }

        console.log('programming device with ' + argv.f);

        // noble enable notifications for characteristics
        self.imgBlockChar.notify(true, function(err) {
          if(err) throw err;
          self.imgBlockChar.on('data', _blockNotify);
          self.imgIdentifyChar.notify(true, function(err) {
            if(err) throw err;
            self.imgIdentifyChar.on('data', rejected_header);
            self.imgIdentifyChar.write(self.imgHdr.getRequest(), false);
          });
        });
      });
    });
  }

  function _blockNotify(data, notification) {

    // clearTimeout(writeBlockTimer);
    // self.writeBlockTimer = setTimeout(function(){
    //   console.log('timeout on writing block ' + self.img_iBlocks);
    //   console.log('trying again!');
    //   _blockNotify(data, notification);
    // }, GATT_WRITE_TIMEOUT);

    if(!self.programming) {
      console.log('this is bad');
      return;
    }
    if(self.img_iBlocks < self.img_nBlocks) {
      self.programming = true;
      var block_buf = new Buffer(OAD_BUFFER_SIZE);
      block_buf[0] = data[0];
      block_buf[1] = data[1];
      self.fileBuffer.copy(block_buf, 2, self.img_iBlocks * OAD_BLOCK_SIZE, (self.img_iBlocks + 1) * OAD_BLOCK_SIZE);
      self.imgBlockChar.write(block_buf, false, function(err) {
        if(err) {
          self.programming = false;
          throw err;
        }
        ++self.img_iBlocks;
        process.stdout.write("Downloaded " + self.img_iBlocks + "/" + self.img_nBlocks +" blocks\r");
        if(self.img_iBlocks === self.img_nBlocks) {
          console.log('\nfinished programming');
          console.log('trying to stop notifying self.imgBlockChar');
          self.imgBlockChar.notify(false, function(err) {
            self.imgIdentifyChar.notify(false, function(err) {
              console.log('done');
            });
          });
        }
      });
    }
  }

}

function rejected_header(data, notification) {
  //TODO better error checking
  console.log('got something from identify');
}

function chars_servs_exist(err, services, characteristics) {
  if(!services[0]) {
    throw new Error('no services found');
  }
  if(!characteristics[0]) {
    throw new Error('no characteristics found');
  }
  if(err) throw err;
}

function print_help() {
  console.log('\n-h displays this message');
  console.log('-b for device address in the form XX:XX:XX:XX:XX:XX');
  console.log('-f provides a required filename for firmware *.bin\n');
  process.exit();
}

// function choose_device(devices)
// {
//   console.log("Discovered devices:");
//   for(var i = 0; i < devices.length; ++i)
//   {
//     console.log(i + ' ' + devices[i].uuid + ' ' + devices[i].advertisement.localName);
//   }
//
//   var rli = readline.createInterface({
//     input: process.stdin,
//     output:process.stdout
//   });
//
//   rli.question('Enter list index of discovered device: ', function(answer) {
//     targetDevice = devices[answer];
//     rli.close();
//   });
//
// }
