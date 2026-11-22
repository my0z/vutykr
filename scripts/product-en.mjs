// 카테고리마다 영어 상품 이름을 미리 적어 둔다. 번역 모델이 엉뚱하게 옮기는 일(딸랑이→고데기 같은)을 막는다
export const EN = {
  vuty: {
    속옷: ['a folded beige women\'s bralette', 'a seamless sports bra', 'a folded set of women\'s underwear'], 의류: ['a folded knit sweater', 'a floral dress on a hanger', 'a white blouse on a hanger', 'a women\'s cardigan folded'],
    바디헤어: ['a shampoo bottle', 'a body wash pump bottle', 'a hair treatment jar', 'a body lotion tube'], 스킨케어: ['a skincare toner bottle', 'a serum dropper bottle', 'a moisturizer cream jar'],
    선케어: ['a sunscreen tube', 'a sun stick'], 클렌징: ['a facial cleansing foam tube', 'a cleansing oil bottle'], 메이크업: ['a lipstick', 'a cushion foundation compact', 'an eyeshadow palette'],
    신발: ['a pair of women\'s white sneakers', 'a women\'s leather loafer', 'women\'s ankle boots'], 가방: ['a women\'s leather shoulder bag', 'a small crossbody bag', 'a women\'s backpack', 'a leather wallet'],
    장신구: ['a pair of pearl earrings', 'a gold ring', 'a hair clip', 'a gold bracelet'], 잡화: ['a wool scarf folded', 'a bucket hat', 'a pair of socks', 'a pair of sunglasses'],
  },
  bebepong: {
    기저귀물티슈: ['a pack of baby wipes', 'a pack of diapers'], 분유이유식: ['a can of infant formula', 'a baby food jar'], 수유용품: ['a baby bottle', 'a breast pump', 'a bottle sterilizer', 'a nursing pillow'],
    유모차카시트: ['a baby stroller', 'an infant car seat', 'a compact folding stroller'], 아기침구가구: ['a white baby crib', 'a folded baby blanket', 'a baby bouncer chair', 'a baby play mat'],
    장난감완구: ['a baby rattle', 'a baby crib mobile', 'a teething ring', 'wooden building blocks'], 아기옷: ['folded baby bodysuits', 'a baby hat', 'baby socks', 'a baby jumpsuit'],
    목욕스킨케어: ['a baby lotion bottle', 'a baby shampoo bottle', 'a baby bathtub'], 이유식용품: ['a baby spoon set', 'a baby sippy cup', 'a baby feeding plate', 'a baby high chair'],
    안전용품: ['a baby safety gate', 'corner protectors', 'electrical outlet covers'], 외출용품: ['a baby carrier', 'a diaper bag', 'a baby hip seat'],
    신생아용품: ['a swaddle blanket', 'a gauze handkerchief', 'a newborn onesie'], 건강위생: ['a baby thermometer', 'a nasal aspirator', 'a baby humidifier', 'baby nail clippers'],
  },
  bodcar: {
    세차: ['a car shampoo bottle', 'a microfiber car wash towel', 'a car wax polish tin'], 실내용품: ['a car air freshener', 'a car seat cover', 'a car trunk organizer'], 블랙박스: ['a car dash cam', 'a microSD memory card'],
    엔진오일: ['a motor oil bottle', 'a fuel additive bottle'], 타이어: ['a car tire', 'a tire inflator pump'], 배터리: ['a car battery', 'a portable jump starter'],
    차량전자: ['a car phone holder', 'a car wireless charger', 'a car USB charger'], 내비하이패스: ['a car GPS navigation device'], 외장용품: ['a car windshield wiper blade', 'a windshield washer fluid bottle', 'a car sunshade'],
    카매트: ['a car floor mat', 'a car trunk mat'], 안전용품: ['a car fire extinguisher', 'a warning triangle', 'a first aid kit'], 공기청정: ['a car air purifier', 'a cabin air filter'],
    전기차: ['an electric vehicle charging cable', 'an EV wall charger'], 차박캠핑: ['a car camping mattress', 'a portable car fridge cooler', 'a camping tent'], 공구정비: ['a car tool kit case', 'a portable air compressor'],
  },
  seareal: {
    낚시대릴: ['a fishing rod', 'a spinning reel', 'a lure fishing rod'], 낚시채비: ['fishing hooks', 'a fishing line spool', 'fishing sinkers'], 낚시용품: ['a folding fishing chair', 'a fishing cooler box', 'fishing gloves'],
    갯벌해루질: ['rubber boots', 'an LED lantern', 'a clam digging hand rake'], 수산물: ['a raw mackerel fish', 'a salmon fillet', 'a cutlassfish'], 패류: ['an abalone', 'oysters on ice', 'clams', 'mussels'],
    갑각류: ['a lobster', 'shrimp', 'a snow crab', 'a blue crab'], 오징어문어: ['a squid', 'an octopus', 'dried squid'], 해조류: ['dried seaweed laver sheets', 'dried kelp', 'a pack of seasoned laver'],
    젓갈: ['a jar of salted pollock roe', 'salted shrimp in a jar'], 건어물: ['dried anchovies', 'dried pollock', 'dried filefish'], 해수욕: ['a swim ring float', 'aqua shoes', 'a rash guard', 'a beach towel'],
    스노클링: ['a snorkel set', 'swim fins', 'a diving mask'], 서핑카약: ['a surfboard', 'a kayak', 'a paddle board'], 방수용품: ['a waterproof phone pouch', 'a waterproof dry bag', 'an action camera waterproof case'],
  },
  zakgong: {
    전동공구: ['a cordless impact driver', 'a power drill', 'an angle grinder', 'a jigsaw'], 수공구: ['a spanner set', 'an adjustable wrench', 'a screwdriver set', 'pliers'],
    측정공구: ['a laser distance meter', 'a spirit level', 'a vernier caliper', 'a tape measure'], 절삭연마: ['a cutting disc', 'a drill bit set', 'sandpaper sheets', 'a hole saw set'],
    용접납땜: ['a soldering iron', 'a welding mask', 'a solder wire spool'], 공구함수납: ['a toolbox', 'a tool bag', 'a tool belt'], 안전용품: ['work gloves', 'safety goggles', 'ear muffs', 'a dust mask'],
    에어공구: ['an air compressor', 'an air blow gun', 'an air hose reel', 'a nail gun'], 체결부품: ['a box of screws', 'anchor bolts', 'cable ties'], 작업조명: ['an LED work light', 'a headlamp'],
    정원공구: ['pruning shears', 'a hand trowel', 'a grass trimmer'], 목공: ['a wood clamp', 'a hand saw', 'a wood plane', 'a wood glue bottle'],
  },
  pemily: {
    사료: ['a bag of dog food', 'a bag of cat food', 'canned wet pet food'], 간식: ['dog treats in a bowl', 'a cat treat tube', 'dental chew bones'], 배변위생: ['a bag of cat litter', 'a pet pee pad pack', 'a cat litter box'],
    급식급수: ['a pet food bowl', 'a cat water fountain', 'an automatic pet feeder'], 장난감: ['a rope dog toy', 'a cat feather wand toy', 'a dog chew ball'], 산책외출: ['a dog harness', 'a dog leash', 'a pet carrier bag'],
    스크래처캣타워: ['a cat scratching post', 'a cat tree tower', 'a cat scratcher board'], 하우스방석: ['a dog bed cushion', 'a cat cave bed', 'a pet bed'], 미용목욕: ['a pet shampoo bottle', 'a pet grooming brush', 'pet nail clippers'],
    건강관리: ['a pet supplement jar', 'a pet toothbrush', 'a pet ear cleaner bottle'], 의류: ['a dog sweater', 'a dog raincoat', 'a pet scarf'], 소동물조류: ['a hamster wheel', 'a rabbit food bag', 'a bird cage'],
    관상어: ['a fish tank aquarium', 'a fish food container', 'an aquarium filter', 'an aquarium heater'],
  },
};
