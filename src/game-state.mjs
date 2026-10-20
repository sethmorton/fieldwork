// Recover from a missed framework round_start using its public received_data event.
export function stateFromGameData(data) {
  if(typeof data?.token!=='string'||typeof data.map!=='string'||!Number.isInteger(data.round)
    ||data.round<1||data.round>5||!Array.isArray(data.rounds)||!Array.isArray(data.player?.guesses))return null;
  const guesses=data.player.guesses;
  const decode=pano=>{
    if(typeof pano!=='string')return undefined;
    if(pano.length%2===0&&/^[a-f\d]+$/i.test(pano)){
      const value=pano.match(/../g).map(pair=>String.fromCharCode(parseInt(pair,16))).join('');
      if(/^[\w-]+$/.test(value))return value;
    }
    return pano;
  };
  return {map:{id:data.map,name:data.mapName},current_game_id:data.token,current_round:data.round,
    round_in_progress:guesses.length<data.round,
    // Never expose unguessed panorama data to the feedback path.
    rounds:data.rounds.slice(0,Math.min(guesses.length,data.round)).map((location,index)=>({
      location:{lat:location.lat,lng:location.lng,panoId:decode(location.panoId)},
      player_guess:{lat:guesses[index].lat,lng:guesses[index].lng},
    }))};
}
