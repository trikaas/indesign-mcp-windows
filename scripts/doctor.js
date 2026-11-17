import { WindowsBridge } from '../src/windows-bridge.js';

try {
  const bridge = new WindowsBridge();
  console.log(await bridge.execute(
    '"InDesign " + app.version + "\\nDocuments open: " + app.documents.length + "\\nUnicode: ação, criação";'
  ));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
