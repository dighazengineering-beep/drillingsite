"""Opens a .docx in LibreOffice, fills the contents / figures / tables lists with real page numbers, and saves a PDF and an updated .docx."""
import sys, os, time, subprocess, uno
from com.sun.star.beans import PropertyValue

def P(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

src, outdir = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
port = 2002 + os.getpid() % 3000
proc = subprocess.Popen(["soffice", "--headless", "--norestore", "--nologo", "--nodefault", "-env:UserInstallation=file://" + outdir + "/profile",
                         "--accept=socket,host=127.0.0.1,port=%d;urp;" % port], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ctx = uno.getComponentContext()
    res = ctx.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", ctx)
    c = None
    for _ in range(90):
        try:
            c = res.resolve("uno:socket,host=127.0.0.1,port=%d;urp;StarOffice.ComponentContext" % port); break
        except Exception:
            time.sleep(1)
    if c is None: raise RuntimeError("LibreOffice did not start")
    desktop = c.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", c)
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(src), "_blank", 0, (P("Hidden", True),))
    for _ in range(2):  # twice: the lists change the page count, so the numbers are settled on the second pass
        idx = doc.getDocumentIndexes()
        for i in range(idx.getCount()): idx.getByIndex(i).update()
        doc.refresh()
    doc.storeToURL(uno.systemPathToFileUrl(outdir + "/out.pdf"), (P("FilterName", "writer_pdf_Export"),))
    doc.storeToURL(uno.systemPathToFileUrl(outdir + "/out.docx"), (P("FilterName", "MS Word 2007 XML"),))
    doc.close(True)
finally:
    proc.terminate()
