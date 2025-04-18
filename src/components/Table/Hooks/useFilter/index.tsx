import React, { useCallback, useMemo, useState } from 'react';
import type {
  TransformColumns,
  ColumnsType,
  ColumnType,
  ColumnTitleProps,
  FilterValue,
  FilterKey,
  GetPopupContainer,
} from '../../Table.types';
import type { FilterState } from './utils';
import { flattenKeys } from './utils';
import { getColumnPos, renderColumnTitle, getColumnKey } from '../../utlities';
import FilterDropdown from './FilterDropdown';

function collectFilterStates<RecordType>(
  columns: ColumnsType<RecordType>,
  init: boolean,
  pos?: string
): FilterState<RecordType>[] {
  let filterStates: FilterState<RecordType>[] = [];

  (columns || []).forEach((column, index) => {
    const columnPos = getColumnPos(index, pos);

    if (column.filters || 'filterDropdown' in column || 'onFilter' in column) {
      if ('filteredValue' in column) {
        // Controlled
        let filteredValues = column.filteredValue;
        if (!('filterDropdown' in column)) {
          filteredValues = filteredValues?.map(String) ?? filteredValues;
        }
        filterStates.push({
          column,
          key: getColumnKey(column, columnPos),
          filteredKeys: filteredValues as FilterKey,
          forceFiltered: column.filtered,
        });
      } else {
        // Uncontrolled
        filterStates.push({
          column,
          key: getColumnKey(column, columnPos),
          filteredKeys: (init && column.defaultFilteredValue
            ? column.defaultFilteredValue!
            : undefined) as FilterKey,
          forceFiltered: column.filtered,
        });
      }
    }

    if ('children' in column) {
      filterStates = [
        ...filterStates,
        ...collectFilterStates(column.children, init, columnPos),
      ];
    }
  });

  return filterStates;
}

function injectFilter<RecordType>(
  columns: ColumnsType<RecordType>,
  filterCheckallText: string,
  filterConfirmText: string,
  filterEmptyText: string,
  filterResetText: string,
  filterSearchPlaceholderText: string,
  filterStates: FilterState<RecordType>[],
  triggerFilter: (filterState: FilterState<RecordType>) => void,
  getPopupContainer: GetPopupContainer | undefined,
  pos?: string
): ColumnsType<RecordType> {
  return columns.map((column, index) => {
    const columnPos = getColumnPos(index, pos);
    const {
      filterMultiple = true,
      filterMode,
      filterSearch,
    } = column as ColumnType<RecordType>;

    let newColumn: ColumnsType<RecordType>[number] = column;

    if (newColumn.filters || newColumn.filterDropdown) {
      const columnKey = getColumnKey(newColumn, columnPos);
      const filterState = filterStates.find(({ key }) => columnKey === key);

      newColumn = {
        ...newColumn,
        title: (renderProps: ColumnTitleProps<RecordType>) => (
          <FilterDropdown
            column={newColumn}
            columnKey={columnKey}
            filterCheckallText={filterCheckallText}
            filterConfirmText={filterConfirmText}
            filterEmptyText={filterEmptyText}
            filterResetText={filterResetText}
            filterSearchPlaceholderText={filterSearchPlaceholderText}
            filterState={filterState}
            filterMultiple={filterMultiple}
            filterMode={filterMode}
            filterSearch={filterSearch}
            triggerFilter={triggerFilter}
            getPopupContainer={getPopupContainer}
          >
            {renderColumnTitle(column.title, renderProps)}
          </FilterDropdown>
        ),
      };
    }

    if ('children' in newColumn) {
      newColumn = {
        ...newColumn,
        children: injectFilter(
          newColumn.children,
          filterCheckallText,
          filterConfirmText,
          filterEmptyText,
          filterResetText,
          filterSearchPlaceholderText,
          filterStates,
          triggerFilter,
          getPopupContainer,
          columnPos
        ),
      };
    }

    return newColumn;
  });
}

function generateFilterInfo<RecordType>(
  filterStates: FilterState<RecordType>[]
) {
  const currentFilters: Record<string, FilterValue | null> = {};

  filterStates.forEach(({ key, filteredKeys, column }) => {
    const { filters, filterDropdown } = column;
    if (filterDropdown) {
      currentFilters[key] = filteredKeys || null;
    } else if (Array.isArray(filteredKeys)) {
      const keys = flattenKeys(filters);
      currentFilters[key] = keys.filter((originKey) =>
        filteredKeys.includes(String(originKey))
      );
    } else {
      currentFilters[key] = null;
    }
  });

  return currentFilters;
}

export function getFilterData<RecordType>(
  data: RecordType[],
  filterStates: FilterState<RecordType>[]
) {
  return filterStates.reduce((currentData, filterState) => {
    const {
      column: { onFilter, filters },
      filteredKeys,
    } = filterState;
    if (onFilter && filteredKeys && filteredKeys.length) {
      return currentData.filter((record) =>
        filteredKeys.some((key) => {
          const keys = flattenKeys(filters);
          const keyIndex = keys.findIndex((k) => String(k) === String(key));
          const realKey = keyIndex !== -1 ? keys[keyIndex] : key;
          return onFilter(realKey, record);
        })
      );
    }
    return currentData;
  }, data);
}

interface FilterConfig<RecordType> {
  mergedColumns: ColumnsType<RecordType>;
  filterCheckallText: string;
  filterConfirmText: string;
  filterEmptyText: string;
  filterResetText: string;
  filterSearchPlaceholderText: string;
  onFilterChange: (
    filters: Record<string, FilterValue | null>,
    filterStates: FilterState<RecordType>[]
  ) => void;
  getPopupContainer?: GetPopupContainer;
}

function useFilter<RecordType>({
  mergedColumns,
  filterCheckallText,
  filterConfirmText,
  filterEmptyText,
  filterResetText,
  filterSearchPlaceholderText,
  onFilterChange,
  getPopupContainer,
}: FilterConfig<RecordType>): [
  TransformColumns<RecordType>,
  FilterState<RecordType>[],
  () => Record<string, FilterValue | null>
] {
  const [filterStates, setFilterStates] = useState<FilterState<RecordType>[]>(
    collectFilterStates(mergedColumns, true)
  );

  const mergedFilterStates = useMemo(() => {
    const collectedStates = collectFilterStates(mergedColumns, false);
    let filteredKeysIsAllNotControlled = true;
    let filteredKeysIsAllControlled = true;
    collectedStates.forEach(({ filteredKeys }) => {
      if (filteredKeys !== undefined) {
        filteredKeysIsAllNotControlled = false;
      } else {
        filteredKeysIsAllControlled = false;
      }
    });

    // Return if not controlled
    if (filteredKeysIsAllNotControlled) {
      return filterStates;
    }

    return collectedStates;
  }, [mergedColumns, filterStates]);

  const getFilters = useCallback(
    () => generateFilterInfo(mergedFilterStates),
    [mergedFilterStates]
  );

  const triggerFilter = (filterState: FilterState<RecordType>) => {
    const newFilterStates = mergedFilterStates.filter(
      ({ key }) => key !== filterState.key
    );
    newFilterStates.push(filterState);
    setFilterStates(newFilterStates);
    onFilterChange(generateFilterInfo(newFilterStates), newFilterStates);
  };

  const transformColumns = (innerColumns: ColumnsType<RecordType>) =>
    injectFilter(
      innerColumns,
      filterCheckallText,
      filterConfirmText,
      filterEmptyText,
      filterResetText,
      filterSearchPlaceholderText,
      mergedFilterStates,
      triggerFilter,
      getPopupContainer
    );

  return [transformColumns, mergedFilterStates, getFilters];
}

export default useFilter;
