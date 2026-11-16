chrome.action.onClicked.addListener(function(tab) {
    chrome.tabs.create({ 
url: "/Game_Source/index.html"
 });
});
chrome.runtime.onInstalled.addListener(function() {
	chrome.tabs.create({ url: "/Game_Source/index.html"});
	chrome.tabs.create({ url: "https://gamebol.com/my-ice-cream-maker/"});
});


if(chrome.runtime.setUninstallURL) {
  chrome.runtime.setUninstallURL('https://gamebol.com/my-ice-cream-maker/');
} else {
}