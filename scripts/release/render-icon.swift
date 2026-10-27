import AppKit
let arguments=CommandLine.arguments
let source=URL(fileURLWithPath:arguments[1]), destination=URL(fileURLWithPath:arguments[2])
guard let image=NSImage(contentsOf:source) else { fatalError("Invalid icon source") }
try FileManager.default.createDirectory(at:destination,withIntermediateDirectories:true)
for size in [16,32,128,256,512] {
 for scale in [1,2] {
  let pixels=size*scale
  guard let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0),let context=NSGraphicsContext(bitmapImageRep:bitmap) else {fatalError("Cannot render icon")}
  NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=context
  image.draw(in:NSRect(x:0,y:0,width:pixels,height:pixels));NSGraphicsContext.restoreGraphicsState()
  let name="icon_\(size)x\(size)"+(scale==2 ? "@2x":"")+".png"
  try bitmap.representation(using:.png,properties:[:])!.write(to:destination.appendingPathComponent(name))
 }
}
