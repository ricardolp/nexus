import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

import { useActiveContractServices } from '@/components/layout/require-org-service';
import { buildTourSteps, firstFiscalNavUrl, type TourStepDef } from '@/components/onboarding/tour-steps';
import { listCompanies } from '@/lib/endpoints';
import { companyPath } from '@/pages/app/settings/companies/paths';
import {
  isProductTourCompleted,
  persistProductTourCompleted
} from '@/lib/product-tour';
import { useAuthStore } from '@/store/auth-store';
import { useProductTourStore } from '@/store/product-tour-store';

function waitForElement(selector: string, timeoutMs = 8000): Promise<Element | null> {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function pathAndSearch(route: string): { pathname: string; search: string } {
  const [pathname, search = ''] = route.split('?');
  return { pathname, search: search ? `?${search}` : '' };
}

function matchesRoute(location: { pathname: string; search: string }, route: string) {
  const target = pathAndSearch(route);
  if (location.pathname !== target.pathname) return false;
  if (!target.search) return true;
  const current = new URLSearchParams(location.search);
  const expected = new URLSearchParams(target.search);
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function toDriveSteps(defs: TourStepDef[]): DriveStep[] {
  return defs.map((step) => ({
    element: step.element,
    skipMissingElement: true,
    waitForElement: 5000,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side,
      align: step.align,
      showButtons: ['next', 'previous', 'close'],
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Concluir',
      progressText: '{{current}} de {{total}}'
    },
    data: { route: step.route, id: step.id }
  }));
}

export function ProductTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const activeServices = useActiveContractServices();
  const startRequestId = useProductTourStore((s) => s.startRequestId);

  const driverRef = useRef<Driver | null>(null);
  const stepsRef = useRef<TourStepDef[]>([]);
  const completingRef = useRef(false);
  const runningRef = useRef(false);
  const persistOnDestroyRef = useRef(true);
  const autoStartedRef = useRef(false);
  const locationRef = useRef(location);
  locationRef.current = location;

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: !!token && !!organizationId
  });

  async function markCompleted() {
    if (!token || !user || completingRef.current) return;
    if (isProductTourCompleted(user.appearance)) return;
    completingRef.current = true;
    try {
      const updated = await persistProductTourCompleted(token, user.appearance, true);
      setUserProfile(updated);
    } catch {
      // Best-effort; avoid blocking destroy
    } finally {
      completingRef.current = false;
    }
  }

  async function goToStepRoute(route: string | undefined) {
    if (!route) return;
    if (matchesRoute(locationRef.current, route)) return;
    navigate(route);
    const target = pathAndSearch(route);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (matchesRoute(locationRef.current, route)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (locationRef.current.pathname !== target.pathname) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  function destroyTour(opts?: { persist?: boolean }) {
    persistOnDestroyRef.current = opts?.persist ?? true;
    const d = driverRef.current;
    driverRef.current = null;
    runningRef.current = false;
    if (d?.isActive()) d.destroy();
  }

  async function startTour(force = false) {
    if (!token || !user || !organizationId) return;
    if (runningRef.current) return;
    if (!force && isProductTourCompleted(user.appearance)) return;
    if (activeServices === null) return;

    const fiscalRoute = firstFiscalNavUrl(activeServices);
    const firstCompany = companiesQuery.data?.items?.[0];
    const certificateRoute = firstCompany ? companyPath(firstCompany.id, 'certificate') : null;

    const defs = buildTourSteps({ fiscalRoute, certificateRoute });
    stepsRef.current = defs;
    persistOnDestroyRef.current = true;
    runningRef.current = true;

    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 10,
      overlayClickBehavior: 'close',
      popoverClass: 'nexus-product-tour',
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Concluir',
      progressText: '{{current}} de {{total}}',
      steps: toDriveSteps(defs),
      onNextClick: async (_el, _step, { driver: drv }) => {
        if (drv.isLastStep()) {
          drv.destroy();
          return;
        }
        const nextIndex = (drv.getActiveIndex() ?? 0) + 1;
        const nextDef = stepsRef.current[nextIndex];
        await goToStepRoute(nextDef?.route);
        if (nextDef?.element) await waitForElement(nextDef.element);
        drv.moveNext();
      },
      onPrevClick: async (_el, _step, { driver: drv }) => {
        const prevIndex = (drv.getActiveIndex() ?? 0) - 1;
        if (prevIndex < 0) return;
        const prevDef = stepsRef.current[prevIndex];
        await goToStepRoute(prevDef?.route);
        if (prevDef?.element) await waitForElement(prevDef.element);
        drv.movePrevious();
      },
      onCloseClick: (_el, _step, { driver: drv }) => {
        drv.destroy();
      },
      onDestroyed: () => {
        const shouldPersist = persistOnDestroyRef.current;
        runningRef.current = false;
        driverRef.current = null;
        persistOnDestroyRef.current = true;
        if (shouldPersist) void markCompleted();
      }
    });

    driverRef.current = d;

    const first = defs[0];
    await goToStepRoute(first?.route);
    if (first?.element) await waitForElement(first.element);
    d.drive(0);
  }

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!token || !user || !organizationId) return;
    if (isProductTourCompleted(user.appearance)) return;
    if (activeServices === null) return;
    if (companiesQuery.isLoading) return;

    autoStartedRef.current = true;
    void startTour(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot after deps ready
  }, [
    token,
    user?.id,
    user?.appearance,
    organizationId,
    activeServices,
    companiesQuery.isLoading,
    companiesQuery.data
  ]);

  useEffect(() => {
    if (startRequestId === 0) return;
    destroyTour({ persist: false });
    void startTour(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequestId]);

  useEffect(() => {
    return () => {
      destroyTour({ persist: false });
    };
  }, []);

  return null;
}
