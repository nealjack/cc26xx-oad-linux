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

    proc = subprocess.Popen(['/usr/bin/hcitool', 'lescan'])
    procs.append(proc)
    time.sleep(lescan_timeout)
    proc.send_signal(signal.SIGINT)
    procs.remove(proc)

    remote_address = input('address of target device: ')
    print(remote_address)
    make_peripheral(remote_address)


def make_peripheral(address):
    peripheral = Peripheral(address)
    services = peripheral.getServices()
    print(services)

if __name__ == "__main__":
    main(sys.argv)
