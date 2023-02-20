// @flow
import assignIn from 'lodash/assignIn';
import {
  serializeToJSObject,
  serializeToObjectAsset,
} from '../../Utils/Serializer';
import optionalRequire from '../../Utils/OptionalRequire';
import LocalFileSystem from '../../Export/LocalExporters/LocalFileSystem';
import { archiveLocalFolder } from '../../Utils/LocalArchiver';
const fs = optionalRequire('fs-extra');
const path = optionalRequire('path');
const remote = optionalRequire('@electron/remote');
const dialog = remote ? remote.dialog : null;

const gd: libGDevelop = global.gd;

const writeJSONFile = (object: Object, filepath: string): Promise<void> => {
  if (!fs) return Promise.reject(new Error('Filesystem is not supported.'));

  try {
    const content = JSON.stringify(object, null, 2);
    return fs.ensureDir(path.dirname(filepath)).then(
      () =>
        new Promise((resolve, reject) => {
          fs.writeFile(filepath, content, (err: ?Error) => {
            if (err) {
              return reject(err);
            }

            return resolve();
          });
        })
    );
  } catch (stringifyException) {
    return Promise.reject(stringifyException);
  }
};

const addSpacesToPascalCase = (pascalCaseName: string): string => {
  let name = pascalCaseName.replace(/([A-Z]+[a-z]|\d+)/g, ' $1');
  name = name.substring(1);
  return name;
};

export default class LocalEventsFunctionsExtensionWriter {
  static chooseEventsFunctionExtensionFile = (
    extensionName?: string
  ): Promise<?string> => {
    if (!dialog) return Promise.reject('Not supported');
    const browserWindow = remote.getCurrentWindow();

    return dialog
      .showSaveDialog(browserWindow, {
        title: 'Export an extension of the project',
        filters: [
          {
            name: 'GDevelop 5 "events based" extension',
            extensions: ['json'],
          },
        ],
        defaultPath: extensionName || 'Extension.json',
      })
      .then(({ filePath }) => {
        if (!filePath) return null;
        return filePath;
      });
  };

  static writeEventsFunctionsExtension = (
    extension: gdEventsFunctionsExtension,
    filepath: string
  ): Promise<void> => {
    const serializedObject = serializeToJSObject(extension);
    return writeJSONFile(serializedObject, filepath).catch(err => {
      console.error('Unable to write the events function extension:', err);
      throw err;
    });
  };

  static chooseObjectAssetFile = (objectName?: string): Promise<?string> => {
    if (!dialog) return Promise.reject('Not supported');
    const browserWindow = remote.getCurrentWindow();

    return dialog
      .showSaveDialog(browserWindow, {
        title: 'Export an object of the project',
        filters: [
          {
            name: 'GDevelop 5 object pack',
            extensions: ['gdo'],
          },
        ],
        defaultPath:
          (objectName && addSpacesToPascalCase(objectName)) || 'Object',
      })
      .then(({ filePath }) => {
        if (!filePath) return null;
        return filePath;
      });
  };

  static writeObjectsAssets = (
    project: gdProject,
    exportedObjects: gdObject[],
    filepath: string
  ): Promise<void> => {
    const localFileSystem = new LocalFileSystem({
      downloadUrlsToLocalFiles: true,
    });
    const fileSystem = assignIn(new gd.AbstractFileSystemJS(), localFileSystem);
    const temporaryOutputDir = path.join(
      fileSystem.getTempDir(),
      'AssetExport'
    );
    fileSystem.mkDir(temporaryOutputDir);
    fileSystem.clearDir(temporaryOutputDir);

    return Promise.all(
      exportedObjects.map(exportedObject => {
        const serializedObject = serializeToObjectAsset(
          project,
          exportedObject
        );
        return writeJSONFile(
          serializedObject,
          path.join(
            temporaryOutputDir,
            addSpacesToPascalCase(exportedObject.getName()) + '.asset.json'
          )
        ).catch(err => {
          console.error('Unable to write the object:', err);
          throw err;
        });
      })
    ).then(() => {
      archiveLocalFolder({
        path: temporaryOutputDir,
        outputFilename: filepath,
      });
    });
  };
}
