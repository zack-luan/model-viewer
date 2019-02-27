/*
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {ACESFilmicToneMapping, BackSide, BoxBufferGeometry, CineonToneMapping, Color, LinearToneMapping, Mesh, NoToneMapping, ReinhardToneMapping, ShaderLib, ShaderMaterial, Uncharted2ToneMapping, UniformsUtils} from 'three';

import {$needsRender, $onModelLoad, $renderer, $scene, $tick} from '../model-viewer-base.js';
import {BASE_SHADOW_OPACITY} from '../three-components/StaticShadow.js';

const DEFAULT_BACKGROUND_COLOR = '#ffffff';

const WHITE = new Color('#ffffff');

const $currentEnvironmentMap = Symbol('currentEnvironmentMap');
const $applyEnvironmentMap = Symbol('applyEnvironmentMap');
const $setEnvironmentImage = Symbol('setEnvironmentImage');
const $setEnvironmentColor = Symbol('setEnvironmentColor');
const $setShadowLightColor = Symbol('setShadowLightColor');
const $hasBackgroundImage = Symbol('hasBackgroundImage');
const $hasBackgroundColor = Symbol('hasBackgroundColor');
const $deallocateTextures = Symbol('deallocateTextures');
const $updateSceneLighting = Symbol('updateSceneLighting');
const $tonePresetToToneMapping = Symbol('tonePresetToToneMapping');
const $updateEnvironment = Symbol('updateEnvironment');
const $cancelUpdateEnvironment = Symbol('cancelUpdateEnvironment');

export const DEFAULT_EXPOSURE = 0.9;
export const DEFAULT_STAGE_LIGHT_INTENSITY = 1.0;

export const AMBIENT_LIGHT_LOW_INTENSITY = 0.05;
export const DIRECTIONAL_LIGHT_LOW_INTENSITY = 0.5;

export const AMBIENT_LIGHT_HIGH_INTENSITY = 3.0;
export const DIRECTIONAL_LIGHT_HIGH_INTENSITY = 0.75;

export const TonePreset = {
  NONE: 'none',
  LINEAR: 'linear',
  REINHARD: 'reinhard',
  UNCHARTED_2: 'uncharted-2',
  CINEON: 'cineon',
  ACES_FILMIC: 'aces-filmic'
};

export const EnvironmentMixin = (ModelViewerElement) => {
  return class extends ModelViewerElement {
    static get properties() {
      return {
        ...super.properties,
        tonePreset: {type: String, attribute: 'tone-preset'},
        backgroundImage: {type: String, attribute: 'background-image'},
        backgroundColor: {type: String, attribute: 'background-color'},
        reflectionImage: {type: String, attribute: 'reflection-image'},
        reflectionIntensity: {type: Number, attribute: 'reflection-intensity'},
        stageLightIntensity: {type: Number, attribute: 'stage-light-intensity'},
        shadowStrength: {type: Number, attribute: 'shadow-strength'},
        exposure: {type: Number, attribute: 'exposure'},
        experimentalPmrem: {type: Boolean, attribute: 'experimental-pmrem'},
      };
    }

    constructor(...args) {
      super(...args);
      this.tonePreset = TonePreset.ACES_FILMIC;
      this.exposure = DEFAULT_EXPOSURE;
      this.shadowStrength = 0.0;
      this.stageLightIntensity = DEFAULT_STAGE_LIGHT_INTENSITY;

      this[$cancelUpdateEnvironment] = null;
    }

    get[$hasBackgroundImage]() {
      // @TODO #76
      return this.backgroundImage && this.backgroundImage !== 'null';
    }

    get[$hasBackgroundColor]() {
      // @TODO #76
      return this.backgroundColor && this.backgroundColor !== 'null';
    }

    connectedCallback() {
      super.connectedCallback();
    }

    update(changedProperties) {
      super.update(changedProperties);

      if (changedProperties.has('stageLightIntensity')) {
        this[$updateSceneLighting]();
      }

      if (changedProperties.has('tonePreset') ||
          changedProperties.has('exposure') ||
          changedProperties.has('shadowStrength')) {
        const scene = this[$scene];
        scene.toneMapping = this[$tonePresetToToneMapping](this.tonePreset);
        scene.toneMappingExposure = this.exposure;
        scene.shadow.material.opacity =
            BASE_SHADOW_OPACITY * this.shadowStrength;
        this[$needsRender]();
      }

      if (!changedProperties.has('backgroundImage') &&
          !changedProperties.has('backgroundColor') &&
          !changedProperties.has('reflectionImage') &&
          !changedProperties.has('experimentalPmrem')) {
        return;
      }

      this[$updateEnvironment](
          this.backgroundImage,
          this.reflectionImage,
          this.backgroundColor,
          this.experimentalPmrem);
    }

    firstUpdated(changedProperties) {
      if (!changedProperties.has('backgroundImage') &&
          !changedProperties.has('backgroundColor')) {
        this[$setEnvironmentColor](DEFAULT_BACKGROUND_COLOR);
      }
    }

    [$tonePresetToToneMapping](tonePreset) {
      switch (tonePreset) {
        case TonePreset.LINEAR:
          return LinearToneMapping;
        case TonePreset.NONE:
          return NoToneMapping;
        case TonePreset.REINHARD:
          return ReinhardToneMapping;
        case TonePreset.UNCHARTED_2:
          return Uncharted2ToneMapping;
        case TonePreset.CINEON:
          return CineonToneMapping;
        default:
        case TonePreset.ACES_FILMIC:
          return ACESFilmicToneMapping;
      }
    }

    [$onModelLoad](e) {
      super[$onModelLoad](e);

      if (this[$currentEnvironmentMap]) {
        this[$applyEnvironmentMap](this[$currentEnvironmentMap]);
      }
    }

    async[$updateEnvironment](
        backgroundUrl, reflectionUrl, backgroundColor, pmrem) {
      if (this[$cancelUpdateEnvironment] != null) {
        this[$cancelUpdateEnvironment]();
        this[$cancelUpdateEnvironment] = null;
      }

      const textureUtils = this[$renderer].textureUtils;

      if (textureUtils == null) {
        return;
      }

      try {
        const {environmentMap, skybox} =
            await new Promise(async (resolve, reject) => {
              const texturesLoad = textureUtils.generateEnvironmentAndSkybox(
                  backgroundUrl, reflectionUrl, {pmrem});

              this[$cancelUpdateEnvironment] = async () => reject(texturesLoad);

              resolve(await texturesLoad);
            });

        this[$deallocateTextures]();

        if (skybox != null) {
          this[$scene].background = skybox;
          this[$setShadowLightColor](WHITE);
        } else if (backgroundColor) {
          const parsedColor = new Color(backgroundColor);
          this[$scene].background = parsedColor;
          this[$setShadowLightColor](parsedColor);
        }

        this[$applyEnvironmentMap](environmentMap);
      } catch (errorOrPromise) {
        if (errorOrPromise instanceof Error) {
          this[$applyEnvironmentMap](null);
          throw errorOrPromise;
        }

        const {environmentMap, skybox} = await errorOrPromise;

        if (environmentMap != null) {
          environmentMap.dispose();
        }

        if (skybox != null) {
          skybox.dispose();
        }
      }
    }

    /**
     * Sets the Model to use the provided environment map,
     * or `null` if the Model should remove its' environment map.
     *
     * @param {THREE.Texture} environmentMap
     */
    [$applyEnvironmentMap](environmentMap) {
      this[$currentEnvironmentMap] = environmentMap;
      this[$scene].model.applyEnvironmentMap(this[$currentEnvironmentMap]);
      this.dispatchEvent(new CustomEvent('environment-changed'));

      this[$updateSceneLighting]();
    }

    [$updateSceneLighting]() {
      const scene = this[$scene];

      if (this.experimentalPmrem) {
        scene.light.intensity =
            AMBIENT_LIGHT_LOW_INTENSITY * this.stageLightIntensity;
        scene.shadowLight.intensity =
            DIRECTIONAL_LIGHT_LOW_INTENSITY * this.stageLightIntensity;
      } else {
        scene.light.intensity =
            AMBIENT_LIGHT_HIGH_INTENSITY * this.stageLightIntensity;
        scene.shadowLight.intensity =
            DIRECTIONAL_LIGHT_HIGH_INTENSITY * this.stageLightIntensity;
      }

      this[$needsRender]();
    }

    [$setShadowLightColor](color) {
      this[$scene].shadowLight.color.copy(color);
      this[$scene].shadowLight.color.lerpHSL(WHITE, 0.5);
    }

    [$deallocateTextures]() {
      const background = this[$scene].background;
      if (background && background.dispose) {
        background.dispose();
      }
      if (this[$currentEnvironmentMap]) {
        this[$currentEnvironmentMap].dispose();
        this[$currentEnvironmentMap] = null;
      }
    }
  }
};
