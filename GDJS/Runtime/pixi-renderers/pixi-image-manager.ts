/*
 * GDevelop JS Platform
 * Copyright 2013-2016 Florian Rival (Florian.Rival@gmail.com). All rights reserved.
 * This project is released under the MIT License.
 */
namespace gdjs {
  const logger = new gdjs.Logger('PIXI Image manager');

  const logFileLoadingError = (file: string, error: Error | undefined) => {
    logger.error(
      'Unable to load file ' + file + ' with error:',
      error ? error : '(unknown error)'
    );
  };

  const applyTextureSettings = (
    texture: PIXI.Texture | undefined,
    resourceData: ResourceData
  ) => {
    if (!texture) return;

    if (!resourceData.smoothed) {
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    }
  };

  const applyThreeTextureSettings = (
    threeTexture: THREE.Texture,
    resourceData: ResourceData | null
  ) => {
    if (resourceData && !resourceData.smoothed) {
      threeTexture.magFilter = THREE.NearestFilter;
      threeTexture.minFilter = THREE.NearestFilter;
    }
  };

  const resourceKinds: Array<ResourceKind> = ['image'];

  /**
   * PixiImageManager loads and stores textures that can be used by the Pixi.js renderers.
   */
  export class PixiImageManager implements gdjs.ResourceManager {
    /**
     * The invalid texture is a 8x8 PNG file filled with magenta (#ff00ff), to be
     * easily spotted if rendered on screen.
     */
    private _invalidTexture: PIXI.Texture;

    /**
     * Map associating a resource name to the loaded PixiJS texture.
     */
    private _loadedTextures: Hashtable<PIXI.Texture<PIXI.Resource>>;

    /**
     * Map associating a resource name to the loaded Three.js texture.
     */
    private _loadedThreeTextures: Hashtable<THREE.Texture>;
    private _loadedThreeMaterials: Hashtable<THREE.Material>;

    private _resourceLoader: gdjs.ResourceLoader;

    /**
     * @param resources The resources data of the game.
     * @param resourceLoader The resources loader of the game.
     */
    constructor(resourceLoader: gdjs.ResourceLoader) {
      this._resourceLoader = resourceLoader;
      this._invalidTexture = PIXI.Texture.from(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVQoU2P8z/D/PwMewDgyFAAApMMX8Zi0uXAAAAAASUVORK5CYIIA'
      );
      this._loadedTextures = new Hashtable();
      this._loadedThreeTextures = new Hashtable();
      this._loadedThreeMaterials = new Hashtable();
    }

    getResourceKinds(): ResourceKind[] {
      return resourceKinds;
    }

    /**
     * Return the PIXI texture associated to the specified resource name.
     * Returns a placeholder texture if not found.
     * @param resourceName The name of the resource
     * @returns The requested texture, or a placeholder if not found.
     */
    getPIXITexture(resourceName: string): PIXI.Texture {
      if (this._loadedTextures.containsKey(resourceName)) {
        const texture = this._loadedTextures.get(resourceName);
        if (texture.valid) {
          return texture;
        } else {
          logger.error(
            'Texture for ' +
              resourceName +
              ' is not valid anymore (or never was).'
          );
        }
      }
      if (resourceName === '') {
        return this._invalidTexture;
      }

      // Texture is not loaded, load it now from the resources list.
      const resource = this._getImageResource(resourceName);

      if (!resource) {
        logger.warn(
          'Unable to find texture for resource "' + resourceName + '".'
        );
        return this._invalidTexture;
      }

      logger.log('Loading texture for resource "' + resourceName + '"...');
      const file = resource.file;
      const texture = PIXI.Texture.from(this._resourceLoader.getFullUrl(file), {
        resourceOptions: {
          // Note that using `false`
          // to not having `crossorigin` at all would NOT work because the browser would taint the
          // loaded resource so that it can't be read/used in a canvas (it's only working for display `<img>` on screen).
          crossorigin: this._resourceLoader.checkIfCredentialsRequired(file)
            ? 'use-credentials'
            : 'anonymous',
        },
      }).on('error', (error) => {
        logFileLoadingError(file, error);
      });
      applyTextureSettings(texture, resource);

      this._loadedTextures.put(resourceName, texture);
      return texture;
    }

    /**
     * Return the three.js texture associated to the specified resource name.
     * Returns a placeholder texture if not found.
     * @param resourceName The name of the resource
     * @returns The requested texture, or a placeholder if not found.
     */
    getThreeTexture(resourceName: string): THREE.Texture {
      const loadedThreeTexture = this._loadedThreeTextures.get(resourceName);
      if (loadedThreeTexture) return loadedThreeTexture;

      // Texture is not loaded, load it now from the PixiJS texture.
      // TODO (3D) - optimization: don't load the PixiJS Texture if not used by PixiJS.
      // TODO (3D) - optimization: Ideally we could even share the same WebGL texture.
      const pixiTexture = this.getPIXITexture(resourceName);
      const pixiRenderer = this._resourceLoader._runtimeGame
        .getRenderer()
        .getPIXIRenderer();
      if (!pixiRenderer) throw new Error('No PIXI renderer was found.');

      // @ts-ignore - source does exist on resource.
      const image = pixiTexture.baseTexture.resource.source;
      console.log(image);
      if (!(image instanceof HTMLImageElement)) {
        throw new Error(
          `Can't load texture for resource "${resourceName}" as it's not an image.`
        );
      }

      const threeTexture = new THREE.Texture(image);
      threeTexture.magFilter = THREE.LinearFilter;
      threeTexture.minFilter = THREE.LinearFilter;
      threeTexture.wrapS = THREE.RepeatWrapping;
      threeTexture.wrapT = THREE.RepeatWrapping;
      threeTexture.colorSpace = THREE.SRGBColorSpace;
      threeTexture.needsUpdate = true;

      const resource = this._getImageResource(resourceName);

      applyThreeTextureSettings(threeTexture, resource);
      this._loadedThreeTextures.put(resourceName, threeTexture);

      return threeTexture;
    }

    /**
     * Return the three.js material associated to the specified resource name.
     * @param resourceName The name of the resource
     * @param options
     * @returns The requested material.
     */
    getThreeMaterial(
      resourceName: string,
      {
        useTransparentTexture,
        forceBasicMaterial,
      }: { useTransparentTexture: boolean; forceBasicMaterial: boolean }
    ) {
      const cacheKey = `${resourceName}|${useTransparentTexture ? 1 : 0}|${
        forceBasicMaterial ? 1 : 0
      }`;

      const loadedThreeMaterial = this._loadedThreeMaterials.get(cacheKey);
      if (loadedThreeMaterial) return loadedThreeMaterial;

      const material = forceBasicMaterial
        ? new THREE.MeshBasicMaterial({
            map: this.getThreeTexture(resourceName),
            side: useTransparentTexture ? THREE.DoubleSide : THREE.FrontSide,
            transparent: useTransparentTexture,
          })
        : new THREE.MeshStandardMaterial({
            map: this.getThreeTexture(resourceName),
            side: useTransparentTexture ? THREE.DoubleSide : THREE.FrontSide,
            transparent: useTransparentTexture,
            metalness: 0,
          });
      this._loadedThreeMaterials.put(cacheKey, material);
      return material;
    }

    /**
     * Return the PIXI video texture associated to the specified resource name.
     * Returns a placeholder texture if not found.
     * @param resourceName The name of the resource to get.
     */
    getPIXIVideoTexture(resourceName: string) {
      if (this._loadedTextures.containsKey(resourceName)) {
        return this._loadedTextures.get(resourceName);
      }
      if (resourceName === '') {
        return this._invalidTexture;
      }

      // Texture is not loaded, load it now from the resources list.
      const resource = this._getImageResource(resourceName);

      if (!resource) {
        logger.warn(
          'Unable to find video texture for resource "' + resourceName + '".'
        );
        return this._invalidTexture;
      }

      const file = resource.file;
      logger.log(
        'Loading video texture for resource "' + resourceName + '"...'
      );
      const texture = PIXI.Texture.from(this._resourceLoader.getFullUrl(file), {
        resourceOptions: {
          // Note that using `false`
          // to not having `crossorigin` at all would NOT work because the browser would taint the
          // loaded resource so that it can't be read/used in a canvas (it's only working for display `<img>` on screen).
          crossorigin: this._resourceLoader.checkIfCredentialsRequired(file)
            ? 'use-credentials'
            : 'anonymous',
        },
      }).on('error', (error) => {
        logFileLoadingError(file, error);
      });

      this._loadedTextures.put(resourceName, texture);
      return texture;
    }

    private _getImageResource = (resourceName: string): ResourceData | null => {
      const resource = this._resourceLoader.getResource(resourceName);
      return resource && this.getResourceKinds().includes(resource.kind)
        ? resource
        : null;
    };

    /**
     * Return a PIXI texture which can be used as a placeholder when no
     * suitable texture can be found.
     */
    getInvalidPIXITexture() {
      return this._invalidTexture;
    }

    /**
     * Load the specified resources, so that textures are loaded and can then be
     * used by calling `getPIXITexture`.
     */
    async loadResource(resourceName: string): Promise<void> {
      const resource = this._resourceLoader.getResource(resourceName);
      if (!resource) {
        logger.warn(
          'Unable to find texture for resource "' + resourceName + '".'
        );
        return;
      }
      await this._loadTexture(resource);
    }

    /**
     * Load the specified resources, so that textures are loaded and can then be
     * used by calling `getPIXITexture`.
     * @param onProgress Callback called each time a new file is loaded.
     */
    async _loadTexture(resource: ResourceData): Promise<void> {
      PIXI.Assets.setPreferences({
        preferWorkers: false,
        preferCreateImageBitmap: false,
        crossOrigin: this._resourceLoader.checkIfCredentialsRequired(
          resource.file
        )
          ? 'use-credentials'
          : 'anonymous',
      });
      try {
        const loadedTexture = await PIXI.Assets.load(resource.file);
        this._loadedTextures.put(resource.name, loadedTexture);
        console.log('Loaded: ' + resource.name);
        // TODO What if 2 assets share the same file with different settings?
        applyTextureSettings(loadedTexture, resource);
      } catch (error) {
        logFileLoadingError(resource.file, error);
      }
    }
  }

  //Register the class to let the engine use it.
  export const ImageManager = gdjs.PixiImageManager;
  export type ImageManager = gdjs.PixiImageManager;
}
