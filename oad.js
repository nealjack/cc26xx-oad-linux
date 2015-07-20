var noble = require('noble');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');
var async = require('async');


var OAD_BLOCK_SIZE = 16;
var OAD_BUFFER_SIZE = 2 + OAD_BLOCK_SIZE;


console.dir(argv);

var target_uuid = null;
var target_device = null;
var discovered = new Array();

// Input args
if(argv.h)
{
    print_help();
}
if(!argv.b || !argv.f)
{
  console.log('invalid command line options');
  print_help();
  process.exit();
}
else if(argv.b)
{
  target_uuid = argv.b.match(/[0-9a-fA-F][^:]/g).join('').toLowerCase();
  if(target_uuid.length != 12)
  {
    console.log('invalid ble address');
    print_help();
    process.exit();
  }
  console.log(target_uuid);
}

fs.readFile(argv.f, function (err, data) {
  if (err) throw err;
  console.log(data.length);
});

// noble init, device discover
noble.on('stateChange', function (state) {
    console.log("Starting scan...");
    if (state === 'poweredOn') {
      noble.startScanning([], false);
    }
    else {
      noble.stopScanning();
    }
});
noble.on('discover', discover_device);

function discover_device(peripheral)
{
  console.log(peripheral.uuid);
  if(peripheral.uuid === target_uuid)
  {
    noble.stopScanning();
    target_device = peripheral;
    console.log('found peripheral ' + target_uuid.match(/../g).join(':'))
    target_device.connect(on_connect);
    target_device.on('disconnect', function(){
      console.log('disconnected');
      process.exit(0);
    });
  }
}

function on_connect(err)
{
  if(err) throw err;
  console.log('connected');
  print_firmware();
}

function print_firmware(){
  service_uuid = ['180a'];
  characteristic_uuid = ['2a26'];
  target_device.discoverServices(service_uuid, function(err, services){
    if(!services[0] || err) throw err;
    service = services[0];
    service.discoverCharacteristics(characteristic_uuid, function(err, characteristics){
      char = characteristics[0];
      char.read(function(err, data){
        console.log(data.toString('ascii'));
      });
    });
  });
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
