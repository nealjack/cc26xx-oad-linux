var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var async = require('async');
var prompt = require('prompt');
var crc = require('./crc.js');

//console.dir(argv);

var OAD_SERVICE = 'f000ffc004514000b000000000000000';
var IMG_IDENTIFY_CHARACTERISTIC = 'f000ffc104514000b000000000000000';
var IMG_BLOCK_CHARACTERISTIC = 'f000ffc204514000b000000000000000';
var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;

var img_hdr = null;

// ble connection variables
var target_uuid = null;
var scan_timeout = null;
var timeout = 10000; // 10 seconds
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
    img_hdr = prepare_image_header(data);
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
        }, timeout);
      }
      else {
        noble.stopScanning();
      }
  });
}

function prepare_image_header(data)
{
  var len = ((32 * 0x1000) / (16 / 4));
  console.log('length: ' + len);
  var ver = 0;
  var uid = new Buffer([0x45, 0x45, 0x45, 0x45]);
  var addr = 0;
  var img_type = 1;
  var crc0 = crc.calc_image_crc(0, data);
  console.log('CRC for image is 0x' + crc0.toString(16));
  var crc1 = 0xFFFF;
  var img_hdr = new Buffer(16);
  img_hdr[0] = loUint16(crc0);
  img_hdr[1] = hiUint16(crc0);
  img_hdr[2] = loUint16(crc1);
  img_hdr[3] = hiUint16(crc1);
  img_hdr[4] = loUint16(ver);
  img_hdr[5] = hiUint16(ver);
  img_hdr[6] = loUint16(len);
  img_hdr[7] = hiUint16(len);
  img_hdr[8] = uid[0];
  img_hdr[9] = uid[1];
  img_hdr[10] = uid[2];
  img_hdr[11] = uid[3];
  img_hdr[12] = loUint16(addr);
  img_hdr[13] = hiUint16(addr);
  img_hdr[14] = img_type;
  img_hdr[15] = 0xFF;

  return img_hdr;
}

function loUint16(x)
{
  // mask as byte
  return x & 0x00FF;
}
function hiUint16(x)
{
  // right shift one byte, mask as byte
  return (x >> 8) & 0x00FF;
}

function discover_device(peripheral)
{
  //console.log(peripheral.uuid);
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
    console.log('ready to program device ' + target_uuid.match(/../g).join(':'));

    //TODO actually program
    prompt.start();
    console.log('start? (y/n)');
    prompt.get(['start'], function (err, result){
      if(err) throw err;
      if(result.start !== 'y'){
        target_device.disconnect();
      }

      console.log('programming device with ' + argv.f);
      console.log('\nenabling notifications');
      img_block_char.notify(true);
      img_block_char.on('data', next_block);
      img_identify_char.notify(true);
      img_identify_char.on('data', rejected_header);
      img_block_char.write(new Buffer("01:00", 'ascii'), false, function(err){
        if(err) throw err;
        console.log('should have enabled notifications\n')
        console.log(img_hdr);
        console.log('sending image header');
        img_identify_char.write(img_hdr, false);
      })

      //target_device.disconnect();
    });
  });
}

function next_block(data, notification){
  console.log('got something from block');
  if(notification)
    console.log(data);
}

function rejected_header(data, notification){
  console.log('got something from identify');
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
