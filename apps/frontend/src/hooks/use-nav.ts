'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/auth-context';
import type { NavGroup, NavItem } from '@/types';

export function useFilteredNavItems(items: NavItem[]) {
  const { activeOrganization, user } = useAuth();

  const accessContext = useMemo(() => {
    return {
      hasOrg: Boolean(activeOrganization),
      role: activeOrganization?.role?.slug,
      permissions: [] as string[],
      isAdmin: user?.role === 'admin',
    };
  }, [activeOrganization, user?.role]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (!item.access) {
          return true;
        }

        if (item.access.requireOrg && !accessContext.hasOrg) {
          return false;
        }

        if (item.access.globalAdmin && !accessContext.isAdmin) {
          return false;
        }

        if (item.access.role && accessContext.role !== item.access.role) {
          return false;
        }

        if (item.access.permission && !accessContext.permissions.includes(item.access.permission)) {
          return false;
        }

        return true;
      })
      .map((item) => {
        if (!item.items?.length) {
          return item;
        }

        return {
          ...item,
          items: item.items.filter((childItem) => {
            if (!childItem.access) {
              return true;
            }

            if (childItem.access.requireOrg && !accessContext.hasOrg) {
              return false;
            }

            if (childItem.access.globalAdmin && !accessContext.isAdmin) {
              return false;
            }

            if (childItem.access.role && accessContext.role !== childItem.access.role) {
              return false;
            }

            if (
              childItem.access.permission &&
              !accessContext.permissions.includes(childItem.access.permission)
            ) {
              return false;
            }

            return true;
          }),
        };
      });
  }, [items, accessContext]);

  return filteredItems;
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const filteredItems = useFilteredNavItems(allItems);

  return useMemo(() => {
    const filteredSet = new Set(filteredItems.map((item) => item.title));
    return groups
      .map((group) => ({
        ...group,
        items: filteredItems.filter((item) =>
          group.items.some((groupItem) => groupItem.title === item.title && filteredSet.has(groupItem.title)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, filteredItems]);
}
