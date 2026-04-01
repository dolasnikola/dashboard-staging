import montserratRegular from './Montserrat-Regular.js'
import montserratBold from './Montserrat-Bold.js'
import montserratItalic from './Montserrat-Italic.js'

export function registerFonts(doc) {
  doc.addFileToVFS('Montserrat-Regular.ttf', montserratRegular)
  doc.addFileToVFS('Montserrat-Bold.ttf', montserratBold)
  doc.addFileToVFS('Montserrat-Italic.ttf', montserratItalic)

  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFont('Montserrat-Italic.ttf', 'Montserrat', 'italic')

  doc.setFont('Montserrat')
}
