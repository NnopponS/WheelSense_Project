"use client";

import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ResolveAlertButton({ alertTitle, disabled, onConfirm }: {
  alertTitle: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>{t("alerts.resolve")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("redesign.resolveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="mb-2 block font-medium text-foreground">{alertTitle}</span>
            {t("redesign.resolveBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={onConfirm}>{t("redesign.resolveConfirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
