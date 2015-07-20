var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var async = require('async');

//console.dir(argv);

var OAD_SERVICE = 'f000ffc004514000b000000000000000';
var IMG_IDENTIFY_CHARACTERISTIC = 'f000ffc104514000b000000000000000';
var IMG_BLOCK_CHARACTERISTIC = 'f000ffc204514000b000000000000000';
var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;

var CRC_POLY = 0x1021;
var BYTE_MASK = 0xFF;
var SHORT_MASK = 0xFFFF;

// image variables
var img_header = new Buffer(12);

// ble connection variables
var target_uuid = null;
var scan_timeout = null;
var target_device = null;
//var discovered = new Array();

// Input args
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
  target_uuid = argv.b.match(/[0-9a-fA-F][^:]/g).join('').toLowerCase();
  if(target_uuid.length != 12)
  {
    console.log('invalid ble address');
    print_help();
  }
  console.log(target_uuid);
}

init();

function init(){
  fs.readFile(argv.f, function (err, data) {
    if (err) throw err;
    prepare_image(data);
    noble.on('discover', discover_device);
  });

  // noble init, device discover
  noble.on('stateChange', function (state) {
      console.log("Starting scan...");
      if (state === 'poweredOn') {
        noble.startScanning([], false);
        scan_timeout = setTimeout(function(){
          console.log('Scanning timed out, ensure peripheral is advertising.');
          process.exit();
        }, 10000);
      }
      else {
        noble.stopScanning();
      }
  });
}

function prepare_image(data)
{
  data.copy(img_header, 0, 0x4, 0x10);
  console.log(img_header);
  var crc = crc16(0x0, 0x37);
  crc = crc16(crc, 0x00);
  crc = crc16(crc, 0x00);
  crc = crc16(crc, 0x00);
  console.log(crc.toString(16));
}

function calc_image_crc(page, buf){
  var crc = 0x00;
  var addr = page * 0x1000;

  var pageBeg = page & SHORT_MASK;
  var pageEnd = (buf.length / (0x1000 / 4)) & BYTE_MASK;
  var osetEnd = ((buf.length - (pageEnd * (0x1000 / 4))) * 4);

  pageEnd += pageBeg;

  while(true) {
    for(var oset = 0; oset < 0x1000; oset++) {
      if((page === pageBeg) && (oset === 0x00)) {
        // Skip the CRC and CRC shadow.
        // CRC and CRC shadow are each 2 bytes, so 4 bytes total
        // Skip three because we increment one more time on next loop.

        oset += 3;
      }
      else if ((page === pageEnd) && (oset === osetEnd)) {
        crc = crc16(crc, 0x00);
        crc = crc16(crc, 0x00);

        return crc;
      }
      else {
        crc = crc16(crc, buf[(addr + oset)]);
      }
    }
    page += 1;
    addr = page * 0x1000;
  }
}

function crc16(crc, val) {
  val &= BYTE_MASK;
  crc &= SHORT_MASK;

  for(var cnt = 0; cnt < 8; cnt++, val <<= 1)
  {
    var msb;
    val &= BYTE_MASK;

    if((crc & 0x8000) == 0x8000) {
      msb = 1;
    }
    else msb = 0;

    crc <<= 1;
    crc &= SHORT_MASK;

    if((val & 0x80) == 0x80) {
      crc |= 0x0001;
    }
    if(msb == 1){
      crc ^= CRC_POLY;
    }
  }

  return crc &= SHORT_MASK;
}

function discover_device(peripheral)
{
  console.log(peripheral.uuid);
  if(peripheral.uuid === target_uuid)
  {
    clearTimeout(scan_timeout);
    noble.stopScanning();
    target_device = peripheral;
    console.log('found requested peripheral ' + target_uuid.match(/../g).join(':'))
    target_device.connect(function(err) {
      if(err) throw err;
      console.log('connected to ' + target_uuid.match(/../g).join(':'));
      print_firmware(oad_program);
    });
    target_device.on('disconnect', function() {
      console.log('disconnected');
      process.exit(0);
    });
  }
}

function print_firmware(callback){
  service_uuids = ['180a'];
  characteristic_uuids = ['2a26'];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    chars_servs_exist(err, services, characteristics);

    char = characteristics[0];
    char.read(function(err, data){
      console.log('Current device firmware is ' + data.toString('ascii'));
      callback();
    });
  });
}



function oad_program(){
  // OAD service
  service_uuids = [OAD_SERVICE];
  // Img Identify, Img Block
  characteristic_uuids = [IMG_IDENTIFY_CHARACTERISTIC, IMG_BLOCK_CHARACTERISTIC];
  target_device.discoverSomeServicesAndCharacteristics(service_uuids, characteristic_uuids,
  function(err, services, characteristics){

    chars_servs_exist(err, services, characteristics);
    img_identify_char = characteristics[0];
    img_block_char = characteristics[1];
    console.log('programming device ' + target_uuid.match(/../g).join(':'));

    //TODO actually program

    target_device.disconnect();
  });
  target_device.disconnect();
}

function chars_servs_exist(err, services, characteristics){
  if(!services[0]){
    throw new Error('no services found');
  }
  if(!characteristics[0]){
    throw new Error('no characteristics found');
  }
  if(err) throw err;
}

function print_help()
{
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
//     target_device = devices[answer];
//     rli.close();
//   });
//
// }
