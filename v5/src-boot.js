var h=(location.hash||"").match(/seed=(\d+)/);
FF.reset(h?parseInt(h[1],10):Math.floor(Math.random()*99999)+1);
FV.paint();
