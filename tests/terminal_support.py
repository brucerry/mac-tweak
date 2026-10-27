"""PTY helpers for native and inert launcher lifecycle checks."""
import errno,os,pty,select,signal,subprocess,termios,time
class TerminalProcess:
 def __init__(self,pid,master):self.pid=pid;self.master=master;self.output=b'';self.returncode=None
 def poll(self):
  self.output+=drain(self.master)
  if self.returncode is None:
   pid,status=os.waitpid(self.pid,os.WNOHANG)
   if pid:self.returncode=os.waitstatus_to_exitcode(status)
  return self.returncode
 def wait(self,timeout):
  limit=time.monotonic()+timeout
  while self.poll() is None:
   if time.monotonic()>limit:raise subprocess.TimeoutExpired(str(self.pid),timeout)
   time.sleep(.02)
  return self.returncode
 def kill(self):os.kill(self.pid,signal.SIGKILL)
def drain(master):
 data=b''
 while select.select([master],[],[],0)[0]:
  try:
   chunk=os.read(master,65536)
   if not chunk:break
   data+=chunk
  except OSError as error:
   if error.errno==errno.EIO:break
   raise
 return data
def wait(p,master,predicate,timeout=8,description='terminal signal'):
 limit=time.monotonic()+timeout;output=b''
 while time.monotonic()<limit:
  output+=drain(master);value=predicate()
  if value:return value
  if p.poll() is not None:raise AssertionError(('worker exited early',p.returncode,output.decode(errors='replace')))
  time.sleep(.02)
 raise AssertionError((description+' timed out',output.decode(errors='replace')))

def start_terminal(arguments,environment=None):
 pid,master=pty.fork()
 if pid==0:
  os.tcsetpgrp(0,os.getpgrp());settings=termios.tcgetattr(0);settings[3]|=termios.ISIG|termios.ICANON;settings[6][termios.VINTR]=b'\x03';termios.tcsetattr(0,termios.TCSANOW,settings)
  os.execve(arguments[0],arguments,environment or dict(os.environ))
 return TerminalProcess(pid,master),master
