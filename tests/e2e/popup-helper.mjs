import { expect } from '@playwright/test';

export function popupHarness(context, worker) {
  let commandId = 0;
  return async page => {
    await page.bringToFront();
    await worker.evaluate(() => chrome.action.openPopup());
    const cdp = await context.newCDPSession(page);
    let target;
    await expect.poll(async () => {
      target = (await cdp.send('Target.getTargets')).targetInfos.find(item => item.type === 'page' && item.url.endsWith('/popup.html'));
      return !!target;
    }).toBe(true);
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    const pending = new Map();
    cdp.on('Target.receivedMessageFromTarget', event => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      pending.get(message.id)?.(message); pending.delete(message.id);
    });
    const evaluate = async expression => {
      const id = ++commandId;
      const response = new Promise(resolve => pending.set(id, resolve));
      await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true } }) });
      const message = await response;
      if (message.error || message.result.exceptionDetails) throw new Error(JSON.stringify(message));
      return message.result.result.value;
    };
    const popup = {
      text: () => evaluate('document.querySelector("#status").textContent'),
      click: () => evaluate('document.querySelector("#toggle").click()'),
      evaluate,
      close: async () => { await cdp.send('Target.closeTarget', { targetId: target.targetId }); await cdp.detach(); },
    };
    await expect.poll(() => evaluate('!document.querySelector("#toggle").disabled')).toBe(true);
    return popup;
  };
}
