export type Player = {
  id: string;
  nickname: string;
  positions: string[];
  champions: string[];
  photo: string;
  number: number;
};

export const TEAM_NAME = "FZL GAMING";

export const roster: Player[] = [
  {
    id: "p1",
    nickname: "只怪我更爱自己",
    positions: ["全能王"],
    champions: ["奥恩", "萨勒芬妮", "加里奥"],
    photo: "/roster/p1.jpg",
    number: 1,
  },
  {
    id: "p2",
    nickname: "讨好冷漠",
    positions: ["上单", "打野", "AD"],
    champions: ["亚索", "诺克萨斯之手", "维克托"],
    photo: "/roster/p2.jpg",
    number: 2,
  },
  {
    id: "p3",
    nickname: "很遗憾不是吗",
    positions: ["中路", "打野"],
    champions: ["泰隆", "乌拉迪米尔", "塞拉斯"],
    photo: "/roster/p3.jpg",
    number: 3,
  },
  {
    id: "p4",
    nickname: "他一定比我更温柔",
    positions: ["上单", "AD"],
    champions: ["剑姬", "薇恩", "金克斯"],
    photo: "/roster/p4.jpg",
    number: 4,
  },
  {
    id: "p5",
    nickname: "变成光守护嘉然然",
    positions: ["打野"],
    champions: ["伊莉丝", "阿木木", "布兰德"],
    photo: "/roster/p5.jpg",
    number: 5,
  },
  {
    id: "p6",
    nickname: "喑糖浆",
    positions: ["中单", "上单", "辅助"],
    champions: ["劫", "亚索", "塔姆"],
    photo: "/roster/p6.jpg",
    number: 6,
  },
  {
    id: "p7",
    nickname: "爱人要错过",
    positions: ["AD", "辅助"],
    champions: ["逆羽", "辛德拉", "魂锁典狱长"],
    photo: "/roster/p7.jpg",
    number: 7,
  },
  {
    id: "p8",
    nickname: "e说句爱我好吗",
    positions: ["上单", "打野", "AD"],
    champions: ["诺克萨斯之手", "武器大师", "内瑟斯"],
    photo: "/roster/p8.jpg",
    number: 8,
  },
];
