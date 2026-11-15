import { Select, type SelectOptions } from '@lobehub/ui';
import * as stylex from '@stylexjs/stylex';
import { useTranslation } from 'react-i18next';

import { useIsMobile } from '@/hooks/useIsMobile';

import { type ModelRef, type SlotChoice } from '../serviceModelState';
import ModelLabel from './ModelLabel';
import { PICKER_WIDTH, styles } from './styles';
import { type ModelKind, toOptionValue, useModelName, useModelOptions } from './useModelCatalog';

const FOLLOW_VALUE = '__follow__';
const OFF_VALUE = '__off__';

/** What a task row shows: the follow target, 「不启用」, or its own model. */
export type RowState = { kind: 'custom'; value: ModelRef } | { kind: 'follow' } | { kind: 'off' };

interface SlotRowProps {
  canDisable: boolean;
  disabled?: boolean;
  /** Who the row follows: 主模型 / Flash 模型 / 向量化模型 / 系统推荐. */
  followLabel: string;
  /** The model the row runs when it follows, shown next to the follow item. */
  followModel?: ModelRef;
  modelKind: ModelKind;
  onChange: (choice: SlotChoice) => void;
  state: RowState;
  /** The picker's accessible name; the row shows the same text as its label. */
  title: string;
  width?: number;
}

/**
 * One task's picker: borderless, in the shared 280px right column. Following
 * and off rows read as gray text; only a pinned row shows an icon and a model
 * name. Picking the first item (the follow target) restores a single row.
 */
const SlotRow = ({
  canDisable,
  disabled,
  followLabel,
  followModel,
  modelKind,
  onChange,
  state,
  title,
  width = PICKER_WIDTH,
}: SlotRowProps) => {
  const { t } = useTranslation('setting');
  const mobile = useIsMobile();
  const { groups, parseValue } = useModelOptions(modelKind);
  const getModelName = useModelName();

  const value =
    state.kind === 'custom'
      ? toOptionValue(state.value)
      : state.kind === 'off'
        ? OFF_VALUE
        : FOLLOW_VALUE;

  const options: SelectOptions = [
    {
      label: (
        <span style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
          <span>{followLabel}</span>
          {followModel && <span {...stylex.props(styles.hint)}>{getModelName(followModel)}</span>}
        </span>
      ),
      title: followLabel,
      value: FOLLOW_VALUE,
    },
    ...groups,
    ...(canDisable
      ? [
          {
            className: stylex.props(styles.offOption).className,
            label: t('serviceModel.off'),
            title: t('serviceModel.off'),
            value: OFF_VALUE,
          },
        ]
      : []),
  ];

  return (
    <Select
      aria-label={title}
      classNames={{ value: stylex.props(styles.triggerValue).className }}
      disabled={disabled}
      value={value}
      variant={mobile ? 'filled' : 'borderless'}
      labelRender={() =>
        state.kind === 'custom' ? (
          <span {...stylex.props(styles.valueEnd, mobile && styles.valueStart)}>
            <ModelLabel model={state.value.model} name={getModelName(state.value)} />
          </span>
        ) : (
          <span {...stylex.props(styles.valueMuted, mobile && styles.valueStart)}>
            {state.kind === 'off' ? t('serviceModel.off') : followLabel}
          </span>
        )
      }
      onChange={(next) => {
        if (typeof next !== 'string' || next === value) return;
        if (next === FOLLOW_VALUE) onChange({ kind: 'follow' });
        else if (next === OFF_VALUE) onChange({ kind: 'off' });
        else onChange({ kind: 'custom', value: parseValue(next) });
      }}
      options={options}
      // borderless sits 1px further right than a filled trigger; keep the arrows in one line
      style={{
        flex: mobile ? '1' : 'none',
        marginInlineEnd: mobile ? 0 : 1,
        minHeight: mobile ? 44 : undefined,
        minWidth: 0,
        width: mobile ? '100%' : width,
      }}
    />
  );
};

export default SlotRow;
