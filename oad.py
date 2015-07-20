import os, sys, time, subprocess, signal
import string
import argparse

sys.path.append('../bluepy/bluepy/')
from btle import Peripheral, UUID, AssignedNumbers

# global
LESCAN_TIMEOUT = 5

class oad_target():

    _peripheral = None

    def _TI_UUID(self, val):
        return UUID("%08X-0451-4000-B000-000000000000" % (0xF0000000+val))

    def __init__(self, address = None):
        if address:
            self.connect(address)


    def _get_characteristic():
        pass

    def get_firmware_rev(self):
        services = self._peripheral.getServices()
        service = self._peripheral.getServiceByUUID(0x180a)
        char = service.getCharacteristics(0x2a26) [0]
        if not char:
            print("no characteristics match")
        return char.read()

    def connect(self, address):
        self._peripheral = Peripheral(address)

def main(argv):
    # check if root
    if not os.geteuid() == 0:
        sys.exit('must be root')

    PROCS = []
    target_device = None

    def sigint_handler(sig, frame):
        for proc in PROCS:
            proc.send_signal(signal.SIGCONT)
            proc.send_signal(signal.SIGINT)
        if(target_device):
            target_device.disconnect()
        print('\n')
        sys.exit(0)
    signal.signal(signal.SIGINT, sigint_handler)

    # add command line option for scanning
    parser = argparse.ArgumentParser(description='An OAD tool for TI CC26xx MCUs')
    parser.add_argument('-s', '--scan', action='store_true',
                        help='provides an initial HCI scan to determine target address')
    parser.add_argument('filename',
                        help='firmware *.bin file to send OAD')
    args = parser.parse_args()

    try:
        with open(args.filename, 'rb') as file:
            pass
    except Exception:
        sys.exit("bad filename")

    if(args.scan):
        do_lescan(PROCS)

    remote_address = input('address of target device: ')
    print(remote_address)
    #make_peripheral(remote_address, peripheral)
    target_device = oad_target(remote_address)
    rev = target_device.get_firmware_rev()
    print(''.join(format(x, '02x') for x in rev))

def do_lescan(proc_list):
    # make sure hcitool is installed, and launch subprocess
    try:
        proc = subprocess.Popen(['/usr/bin/hcitool', 'lescan'])
    except Exception:
        print('hcitool is not installed, install bluez')
        sys.exit(1)

    # add to list of active subprocesses
    proc_list.append(proc)
    while(True):
        time.sleep(LESCAN_TIMEOUT)
        # pause scanning
        proc.send_signal(signal.SIGSTOP)

        # ask to continue
        while(True):
            more_scan = input('continue scanning? (y/n) ').strip()
            if(more_scan == 'y' or more_scan == 'n'):
                break
        # continue subprocess regardless
        proc.send_signal(signal.SIGCONT)
        if(more_scan.strip() == 'n'):
            break
        else:
            continue

    # tell hcitool to exit and remove from active subprocess list
    proc.send_signal(signal.SIGINT)
    proc_list.remove(proc)

# def make_peripheral(address, peripheral):
#     try:
#         peripheral = Peripheral(address)
#     except Exception:
#         print('failed to open peripheral')
#     characs = peripheral.getCharacteristics()
#     charac_dir = {}
#     for charac in characs:
#         charac_dir[format(charac.getHandle(), '02x')] = charac
#         print('0x' + format(charac.getHandle(), '02x'))
#     peripheral.disconnect()


if __name__ == "__main__":
    main(sys.argv)
