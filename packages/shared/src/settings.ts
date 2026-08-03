import type {
  IeLuaSettings,
  LuaDialect,
  SourceSectionId,
  UnknownGlobalSeverity,
  ValidationMode,
} from './types';

export const DEFAULT_VALIDATION_DEBOUNCE_MS = 300;
export const MAX_VALIDATION_DEBOUNCE_MS = 2_147_483_647;

export interface SettingsInput {
  dialect?: LuaDialect;
  validation?: {
    mode?: ValidationMode;
    debounceMs?: number;
  };
  symbolSources?: {
    enabled?: SourceSectionId[];
  };
  diagnostics?: {
    unknownGlobals?: UnknownGlobalSeverity;
  };
  formatter?: {
    configPath?: string;
  };
  menu?: {
    blockKeys?: string[];
    expressionKeys?: string[];
  };
}

export const allSourceSections: SourceSectionId[] = [
  'ee-game-lua-functions',
  'eeex-functions',
  'ee-game-structures-x64',
  'lua52',
  'luajit',
  'ee-utility-functions',
];

export const defaultSettings: IeLuaSettings = {
  dialect: 'lua52',
  validation: {
    mode: 'save',
    debounceMs: DEFAULT_VALIDATION_DEBOUNCE_MS,
  },
  symbolSources: {
    enabled: allSourceSections,
  },
  diagnostics: {
    unknownGlobals: 'off',
  },
  formatter: {
    configPath: '.stylua.toml',
  },
  menu: {
    blockKeys: ['action', 'onOpen', 'onopen', 'onClose', 'onclose', 'on escape'],
    expressionKeys: ['enabled', 'clickable'],
  },
};

export function normalizeSettings(input: SettingsInput | undefined): IeLuaSettings {
  return {
    dialect: input?.dialect ?? defaultSettings.dialect,
    validation: {
      mode: input?.validation?.mode ?? defaultSettings.validation.mode,
      debounceMs: normalizeValidationDebounceMs(input?.validation?.debounceMs),
    },
    symbolSources: {
      enabled: input?.symbolSources?.enabled ?? defaultSettings.symbolSources.enabled,
    },
    diagnostics: {
      unknownGlobals:
        input?.diagnostics?.unknownGlobals ?? defaultSettings.diagnostics.unknownGlobals,
    },
    formatter: {
      configPath: input?.formatter?.configPath ?? defaultSettings.formatter.configPath,
    },
    menu: {
      blockKeys: input?.menu?.blockKeys ?? defaultSettings.menu.blockKeys,
      expressionKeys: input?.menu?.expressionKeys ?? defaultSettings.menu.expressionKeys,
    },
  };
}

function normalizeValidationDebounceMs(value: number | undefined): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_VALIDATION_DEBOUNCE_MS
  ) {
    return DEFAULT_VALIDATION_DEBOUNCE_MS;
  }
  return value;
}

export function mergeSettings(...inputs: Array<SettingsInput | undefined>): SettingsInput {
  const merged: SettingsInput = {};

  for (const input of inputs) {
    if (!input) {
      continue;
    }
    if (input.dialect !== undefined) {
      merged.dialect = input.dialect;
    }
    if (input.validation) {
      merged.validation = { ...merged.validation, ...input.validation };
    }
    if (input.symbolSources) {
      merged.symbolSources = { ...merged.symbolSources, ...input.symbolSources };
    }
    if (input.diagnostics) {
      merged.diagnostics = { ...merged.diagnostics, ...input.diagnostics };
    }
    if (input.formatter) {
      merged.formatter = { ...merged.formatter, ...input.formatter };
    }
    if (input.menu) {
      merged.menu = { ...merged.menu, ...input.menu };
    }
  }

  return merged;
}
