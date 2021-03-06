var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var prompt = require('prompt');
var ProgressBar = require('progress');
var ImgHdr = require('./ImgHdr');
var binary = require('./Binary');

//console.dir(argv);

// Programming parameters
var OAD_CONN_INTERVAL = 6; // 15 milliseconds
var OAD_SUPERVISION_TIMEOUT = 50; // 500 milliseconds
var GATT_NOTIFY_TIMEOUT = 5000; // 5 seconds
var GATT_WRITE_TIMEOUT = 500; // Milliseconds

// OAD parameters
var OAD_SERVICE = 'f000ffc004514000b000000000000000';
var IMG_IDENTIFY_CHAR = 'f000ffc104514000b000000000000000';
var IMG_BLOCK_CHAR = 'f000ffc204514000b000000000000000';
var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;

var CONNECTION_PARAMS_SERVICE = 'f000ccc004514000b000000000000000';
var CONN_PARAMS_CHAR = 'f000ccc104514000b000000000000000';
var CONN_PARAMS_REQ_CHAR = 'f000ccc204514000b000000000000000';

var SCAN_TIMEOUT = 5000; // 10 seconds

//var discovered = new Array();
var fwUpdate = FwUpdate_CC26xx(argv);

function FwUpdate_CC26xx(argv) {
  var self = this;
  this.targetUuid = null;
  this.targetDevice = null;
  this.fileBuffer = null;
  this.imgHdr = null;
  this.onChip = false;

  this.scanList = [];
  this.scanTimer = null;
  this.writeTimer = null;

  this.img_nBlocks = null;
  this.img_iBlocks = 0;
  this.programming = true;
  this.imgIdentifyChar = null;
  this.imgBlockChar = null;

  this.progressBar = null;

  if(argv.h) {
    print_help();
  }
  if(argv.c) {
    onChip = true;
  }
  if(!argv.f) {
    console.log('invalid command line options');
    print_help();
  }
  else if(argv.b) {
    this.targetUuid = argv.b.match(/[0-9a-fA-F][^:]/g).join('').toLowerCase();
    if(this.targetUuid.length != 12) {
      console.log('invalid ble address');
      print_help();
    }
  }
  else {
    // argv.b isn't there
    console.log('will perform scan');
  }



  fs.readFile(argv.f, function init(err, data) {
    if (err) throw err;
    self.fileBuffer = data;
    img_nBlocks = self.fileBuffer.length / OAD_BLOCK_SIZE;
    self.imgHdr = new ImgHdr(data, self.onChip);
    noble.on('discover', _discoverDevice);
    if(noble.state == 'poweredOn'){
      _startScan();
    }
    noble.on('stateChange', function (state) {
        console.log("Starting scan...");
        if (state === 'poweredOn') {
          _startScan();
        }
        else {
          noble.stopScanning();
        }
    });
  });

  function _startScan() {
    noble.startScanning([], false);
    self.scanTimer = setTimeout(function() {
      noble.stopScanning();
      if(argv.b) {
        console.log('Scanning timed out, ensure peripheral is advertising.');
        process.exit();
      }
      else {
        _pickDevice();
      }
    }, SCAN_TIMEOUT);
  }

  function _discoverDevice(peripheral) {
    console.log('discovered device: ' + peripheral.uuid.match(/../g).join(':'));
    if(peripheral.uuid === self.targetUuid) {
      clearTimeout(self.scanTimer);
      noble.stopScanning();
      self.targetDevice = peripheral;
      console.log('found requested peripheral ' + self.targetUuid.match(/../g).join(':'))
      _prepareDevice();
    }
    else {
      self.scanList.push(peripheral);
    }
  }

  function _pickDevice() {
    console.log('Pick a device from the list: ');
    for(var i = 0; i < scanList.length; ++i) {
      var peripheral = scanList[i];
      console.log(i + ' ' + scanList[i].uuid.match(/../g).join(':') + ' ' + scanList[i].advertisement.localName);
    }
    prompt.start();
    prompt.get('device', function(err, result){
      if(err) throw err;
      if(result < 0 || result >= scanList.length){
        console.log('bad input');
      }
      self.targetDevice = scanList[result.device];
      _prepareDevice();
    });

  }

  function _prepareDevice() {
    self.targetDevice.connect(function(err) {
      if(err) throw err;
      console.log('connected to ' + self.targetDevice.uuid.match(/../g).join(':'));
      _setConnectionParams(function() {
        _printFirmware(function() {
          _oadProgram();
        });
      });
    });
    self.targetDevice.on('disconnect', function() {
      console.log('disconnected from ' + self.targetDevice.uuid.match(/../g).join(':'));
      process.exit(0);
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
          clearTimeout(self.writeTimer);
          console.log('done!');
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
        console.log('writing connection parameters');
        self.writeTimer = setTimeout(_timedOut, GATT_NOTIFY_TIMEOUT);
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
      if(!argv.y){
        prompt.start();
        console.log('start? (y/n)');
        prompt.get(['start'], function (err, result) {
          if(err) throw err;
          if(result.start !== 'y') {
            self.targetDevice.disconnect();
          }

          _sendImgHeader();

        });
      }
      else {
        _sendImgHeader();
      }
    });
  }

  function _sendImgHeader() {
    self.progressBar = new ProgressBar('downloading [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: self.fileBuffer.length/OAD_BLOCK_SIZE
    });

    // noble enable notifications for characteristics
    self.imgBlockChar.notify(true, function(err) {
      if(err) throw err;
      self.imgBlockChar.on('data', _blockNotify);
      self.imgIdentifyChar.notify(true, function(err) {
        if(err) throw err;
        self.imgIdentifyChar.on('data', rejected_header);
        self.imgIdentifyChar.write(self.imgHdr.getRequest(), false, function(err){
          if(err) throw err;
          console.log('writing image header');
          writeTimer = setTimeout(_timedOut, GATT_NOTIFY_TIMEOUT);
        });
      });
    });
  }

  function _blockNotify(data, notification) {
    if(img_iBlocks === 0) {
      console.log('done!');
      console.log('programming device with ' + argv.f);
    }

    clearTimeout(self.writeTimer);
    self.writeTimer = setTimeout(function(){
      console.log('\ntimeout on writing block ' + self.img_iBlocks);
      self.targetDevice.disconnect();
    }, GATT_WRITE_TIMEOUT);

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
        // update the progress bar
        if(img_iBlocks % 10 === 0) {
          self.progressBar.tick(10);
        }
        // process.stdout.write("Downloaded " + self.img_iBlocks + "/" + self.img_nBlocks +" blocks\r");
        if(self.img_iBlocks === self.img_nBlocks) {
          console.log('\nfinished programming');
          self.imgBlockChar.notify(false, function(err) {
            self.imgIdentifyChar.notify(false, function(err) {
              clearTimeout(self.writeTimer);
              console.log('done');
            });
          });
        }
      });
    }
  }

  function _timedOut(type) {
    console.log('write timed out');
    self.targetDevice.disconnect();
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
  console.log('-y skips user prompt');
  console.log('-c on-chip firmware download');
  console.log('-b provides device address in the form XX:XX:XX:XX:XX:XX');
  console.log('-f provides a required filename for firmware *.bin\n');
  process.exit();
}
