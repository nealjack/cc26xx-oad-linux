import sys
sys.path.append('../bluepy/bluepy/')
from btle import UUID, Peripheral, DefaultDelegate

def main(argv):
    # check if root
    if not os.geteuid() == 0:
        sys.exit("must be root")
    

if __name__ == "__main__":
    main(sys.argv)
