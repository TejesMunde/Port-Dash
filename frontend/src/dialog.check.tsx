// Regression check: the trigger must render while the dialog is closed.
// Run: npx esbuild src/dialog.check.tsx --bundle --platform=node --outfile=check.cjs && node check.cjs
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogTrigger, DialogContent } from "./components/ui/dialog";

const tree = (open: boolean) => (
  <Dialog open={open} onOpenChange={() => {}}>
    <DialogTrigger asChild>
      <button>+ Add forward</button>
    </DialogTrigger>
    <DialogContent>SECRET_CONTENT</DialogContent>
  </Dialog>
);

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error("dialog.check FAILED: " + msg);
};

const closed = renderToStaticMarkup(tree(false));
const opened = renderToStaticMarkup(tree(true));

assert(closed.includes("+ Add forward"), "trigger must render while closed");
assert(!closed.includes("SECRET_CONTENT"), "content must be hidden while closed");
assert(opened.includes("+ Add forward"), "trigger must stay rendered while open");
assert(opened.includes("SECRET_CONTENT"), "content must render while open");

console.log("dialog.check ok");
