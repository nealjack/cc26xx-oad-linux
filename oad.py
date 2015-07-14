import os, sys, string, time, subprocess, signal
sys.path.append('../bluepy/bluepy/')
from btle import UUID, Peripheral, DefaultDelegate

lescan_timeout = 5
procs = []

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
