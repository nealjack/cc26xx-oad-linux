import os, sys, time, subprocess, signal
import string
import argparse

sys.path.append('../bluepy/bluepy/')
from btle import UUID, Peripheral, DefaultDelegate

lescan_timeout = 5
procs = []

def sigint_handler(sig, frame):
    for proc in procs:
        proc.send_signal(signal.SIGCONT)
        proc.send_signal(signal.SIGINT)
    print('\n')
    sys.exit(0)
signal.signal(signal.SIGINT, sigint_handler)

def main(argv):
    # check if root
    if not os.geteuid() == 0:
        sys.exit('must be root')

    # add command line option for scanning
    parser = argparse.ArgumentParser(description='An OAD tool for TI CC26xx MCUs')
    parser.add_argument('-s', '--scan', action='store_true',
                        help='provides an initial HCI scan to determine target address')

    args = parser.parse_args()
    if(args.scan):
        do_lescan()

    remote_address = input('address of target device: ')
    print(remote_address)
    make_peripheral(remote_address)

def do_lescan():
    # make sure hcitool is installed, and launch subprocess
    try:
        proc = subprocess.Popen(['/usr/bin/hcitool', 'lescan'])
    except Exception:
        print('hcitool is not installed, install bluez')
        sys.exit(1)

    # add to list of active subprocesses
    procs.append(proc)
    while(True):
        time.sleep(lescan_timeout)
        # pause scanning
        proc.send_signal(signal.SIGSTOP)

        # ask to continue
        while(True):
            more_scan = input('continue scanning? (y/n) ').strip()
            if(more_scan == 'y' or more_scan == 'n'):
                break
        # continue subprocess regardless
        # if we get an SIGINT here, we want to let hcitool exit gracefully
        proc.send_signal(signal.SIGCONT)
        if(more_scan.strip() == 'n'):
            break
        else:
            continue

    # tell hcitool to exit and remove from active subprocess list
    proc.send_signal(signal.SIGINT)
    procs.remove(proc)

def make_peripheral(address):
    peripheral = Peripheral(address)
    services = peripheral.getServices()
    print(services)

if __name__ == "__main__":
    main(sys.argv)
